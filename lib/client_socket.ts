/**
 *   Contents:
 * 
 *       ClientSocket
 *           constructor
 *           connect
 *           send_norm
 *           recv_norm
 *           recv_rev
 *           send_rev
 *           _validate_client
 *           _track_client
 *           _recv_norm_step
 *           _recv_rev_step
 *           add_metadata
 *           is_validated
 *           wait
 *           close
 */

import { Mutex, Thread, ServerMessage, SocketMetadataInfo, is_dictionary_list } from './common_base'
import * as zmq from 'zeromq'
import assert from 'assert'
import * as nrpc_ts from './common_base'

class ClientSocket {
    client_id: number
    ip_address: string
    port: number
    port_rev: number
    entry_file: string
    server_signature: Buffer
    server_signature_rev: Buffer
    client_signature: Buffer
    client_signature_rev: Buffer
    is_alive: boolean
    is_connected: boolean
    is_validated_: boolean
    is_lost: boolean
    client_errors: string
    metadata: SocketMetadataInfo
    server_metadata: SocketMetadataInfo | null
    zmq_context: zmq.Context
    zmq_client_: zmq.Router
    zmq_client_rev_: zmq.Router
    zmq_monitor_: zmq.Observer
    zmq_monitor_thread_: Thread
    request_lock: Mutex
    norm_messages_: any[]
    rev_messages_: any[]

    constructor(ip_address, port, port_rev, entry_file) {
        this.client_id = 0
        this.ip_address = ip_address
        this.port = port
        this.port_rev = port_rev
        this.entry_file = entry_file
        this.server_signature = Buffer.from('server:0')
        this.server_signature_rev = Buffer.from('rev:server:0')
        this.client_signature = null
        this.client_signature_rev = null
        this.is_alive = true
        this.is_connected = false
        this.is_validated_ = false
        this.is_lost = false
        this.client_errors = ''
        this.metadata = {
            client_id: null,
            lang: 'typescript',
            ip_address: ip_address,
            main_port: port,
            main_port_rev: port_rev,
            host: 'unknown',
            entry_file: this.entry_file,
            start_time: new Date().toISOString(),
            client_signature: null,
            client_signature_rev: null,
        }
        this.server_metadata = null
        // @ts-ignore
        this.zmq_context = null
        // @ts-ignore
        this.zmq_client_ = null
        // @ts-ignore
        this.zmq_client_rev_ = null
        // @ts-ignore
        this.zmq_monitor_ = null
        this.zmq_monitor_thread_ = null
        this.request_lock = new Mutex()
        this.norm_messages_ = []
        this.rev_messages_ = []
    }

    async connect() {
        assert(!this.is_validated_)

        this.zmq_context = new zmq.Context()

        this.zmq_client_ = new zmq.Router({ context: this.zmq_context })
        this.zmq_monitor_ = this.zmq_client_.events
        this.zmq_monitor_.on('handshake', () => {
            this._track_client('handshake')
        })
        this.zmq_monitor_.on('disconnect', () => {
            this._track_client('disconnect')
        })

        this.zmq_client_.connect(
            `tcp://${this.ip_address}:${this.port}`,
            // @ts-ignore
            { routingId: this.server_signature }
        )

        while (this.is_alive && !this.is_connected) {
            await nrpc_ts.sleepAsync(100)
        }
        if (!this.is_alive) {
            return
        }

        let resp: any[] = null
        await this.request_lock.runExclusive(async () => {
            await this.zmq_client_.send([
                this.server_signature,
                ServerMessage.AddClient,
                JSON.stringify(this.metadata)
            ])
            resp = await this.zmq_client_.receive()
        })


        assert(resp[1].toString() == ServerMessage.ClientAdded)
        const resp2 = JSON.parse(resp[2].toString())

        this.client_id = resp2['client_id']
        this.client_signature = nrpc_ts.base64_decode(resp2['client_signature'])
        this.client_signature_rev = nrpc_ts.base64_decode(resp2['client_signature_rev'])
        this.metadata['client_id'] = this.client_id
        this.metadata['client_signature'] = nrpc_ts.base64_encode(this.client_signature)
        this.metadata['client_signature_rev'] = nrpc_ts.base64_encode(this.client_signature_rev)
        
        // console.log('ADDED CLIENT', resp2['client_signature_rev'])
        // console.log('ADDED CLIENT', this.client_signature_rev, this.client_signature_rev.toString(), resp[0].toString())

        assert(this.zmq_client_rev_ == null)

        this.zmq_client_rev_ = new zmq.Router({
            context: this.zmq_context,
            // @ts-ignore
            routingId: this.client_signature_rev    
        })
        this.zmq_client_rev_.connect(
            `tcp://${this.ip_address}:${this.port_rev}`, 
            // @ts-ignore
            { routingId: this.server_signature_rev }
        )

        // await nrpc_ts.sleepAsync(1000)

        while (this.is_alive) {
            const req: any[] = await this.zmq_client_rev_.receive()
            assert(req.length == 3)
            if (req[1].toString() == ServerMessage.ValidateClient) {
                await this._validate_client(req)
                break
            } else {
                console.log('Early message on client side!')
                const method_name = req[1].toString()
                await this.zmq_client_rev_.send([
                    this.server_signature_rev,
                    `message_dropped:${method_name}`,
                    JSON.stringify({ 'error': 'Early message dropped' })
                ])
            }
        }
        assert(this.is_validated_)
    }

    async send_norm(request) {
        assert(this.zmq_client_rev_ !== null)
        const req = [
            this.server_signature,
            request[0],
            request[1],
        ]
        if (is_dictionary_list(req[2])) {
            req[2] = JSON.stringify(req[2])
        }
        await this.zmq_client_.send(req)
    }

    async recv_norm() {
        // TODO: _recv_norm_step
        const resp: any[] = await this.zmq_client_.receive()
        assert(resp.length == 3)
        assert(resp[2].toString() != 'null')
        // TODO: getting empty buffer when client is lost
        assert(resp[2].at(0) == '{'.charCodeAt(0) || resp[2].at(0) == '['.charCodeAt(0), `Invalid json: ${resp[2]}`)
        return resp[2]
    }

    async recv_rev(timeout_ms = 0) {
        if (!this.is_validated_) {
            await nrpc_ts.sleepAsync(100)
            if (!this.is_validated_) {
                return null
            }
        }

        const started = new Date().getTime()
        let req: Buffer[] = null
        while (this.is_alive) {
            if (!this.zmq_client_rev_.readable) {
                await nrpc_ts.sleepAsync(50)
                if (timeout_ms > 0 && new Date().getTime() - started > timeout_ms) {
                    break
                }
                continue
            }
            // TODO: _recv_rev_step
            req = await this.zmq_client_rev_.receive()

            assert(req)
            assert(req.length == 3)

            if (req[1].toString() == ServerMessage.ValidateClient) {
                assert(false, `Second validation! ${this.client_id}`)
                await this._validate_client(req)
            } else {
                break
            }
        }

        if (!this.is_alive) {
            return null
        }
        return req ? [req[1], req[2]] : null
    }

    async send_rev(response) {
        assert(this.zmq_client_rev_)
        assert(response.length == 2)
        const resp = [
            this.server_signature_rev,
            response[0],
            response[1]
        ]

        if (is_dictionary_list(resp[2])) {
            resp[2] = JSON.stringify(resp[2])
        }

        await this.zmq_client_rev_.send(resp)
    }

    async _validate_client(req) {
        assert(req[0].equals(this.server_signature_rev))
        const req2 = JSON.parse(req[2].toString())
        assert(this.client_id == req2['client_id'])
        assert(this.client_signature.equals(nrpc_ts.base64_decode(req2['client_signature'])))
        assert(this.client_signature_rev.equals(nrpc_ts.base64_decode(req2['client_signature_rev'])))
        this.server_metadata = req2['server_metadata']
        await this.zmq_client_rev_.send([
            this.server_signature_rev,
            ServerMessage.ClientValidated,
            JSON.stringify(this.metadata)
        ])
        this.is_validated_ = true
    }

    async _track_client(event_id) {
        if (event_id == 'handshake') {
            this.is_connected = true
        }
        else if (event_id == 'disconnect') {
            this.is_lost = true
            this.client_errors += '\nClient disconnected'
        }
    }

    _recv_norm_step() {
        // TODO
    }

    _recv_rev_step() {
        // TODO
    }

    add_metadata(obj: object) {
        for (const key in obj) {
            this.metadata[key] = obj[key]
        }
    }

    get is_validated() {
        return this.is_validated_
    }

    async wait() {
        // TODO: how to poll typescript's zeromq socket
        while (this.is_alive && !this.is_lost && !this.zmq_monitor_.closed) {
            if (this.zmq_client_.closed)
                break
            await nrpc_ts.sleepAsync(50)
        }
    }

    close() {
        const sockets = [
            this.zmq_monitor_,
            this.zmq_client_,
            this.zmq_client_rev_
        ]

        this.is_alive = false
        this.zmq_client_ = null
        this.zmq_client_rev_ = null
        this.zmq_monitor_ = null
        this.zmq_monitor_thread_ = null

        for (const item of sockets) {
            if (item) {
                try {
                    item.close()
                }
                catch (ex) {
                }
            }
        }

        this.zmq_context = null
    }

}

export {
    ClientSocket
}