/**
 *  Contents:
 * 
 *      ServerSocket
 *          constructor
 *          bind
 *          get_client_change
 *          recv_norm
 *          send_norm
 *          send_rev
 *          recv_rev 
 *          _add_client
 *          _track_client
 *          _recv_norm_step
 *          _recv_rev_step
 *          _forward_call
 *          get_client_ids
 *          get_client_full
 *          get_client_info
 *          add_metadata
 *          update
 *          wait
 *          close
 */

import { Mutex, ServerMessage, SocketMetadataInfo, ClientInfo, is_dictionary, is_dictionary_list } from './common_base'
import * as zmq from 'zeromq'
import assert from 'assert'
import * as nrpc_ts from './common_base'

// const zmq_util = require('../../../../build/Release/zmq_util')

// See also: node_modules/zeromq/lib/native.d.ts

class ServerSocket {
    server_id: number
    ip_address: string
    port: number
    port_rev: number
    entry_file: string
    next_index: number
    server_signature: Buffer
    server_signature_rev: Buffer
    clients: ClientInfo[]
    metadata: SocketMetadataInfo
    zmq_context: zmq.Context
    zmq_server_: zmq.Router
    zmq_server_rev_: zmq.Router
    zmq_monitor_: any
    zmq_monitor_thread_: any
    request_lock: Mutex
    is_alive: boolean
    norm_messages_: Buffer[]
    rev_messages_: Buffer[]

    constructor(ip_address: string, port: number, port_rev: number, entry_file: string) {
        this.server_id = 0
        this.ip_address = ip_address
        this.port = port
        this.port_rev = port_rev
        this.entry_file = entry_file
        this.server_id = 0
        this.next_index = 0
        this.server_signature = Buffer.from('server:0')
        this.server_signature_rev = Buffer.from('rev:server:0')
        this.clients = []
        this.metadata = {
            server_id: 0,
            lang: 'typescript',
            ip_address: ip_address,
            main_port: port,
            main_port_rev: port_rev,
            host: 'unknown',
            entry_file: this.entry_file,
            start_time: new Date().toISOString(),
            server_signature: nrpc_ts.base64_encode(this.server_signature),
            server_signature_rev: nrpc_ts.base64_encode(this.server_signature_rev),
        }

        this.request_lock = new Mutex()
        this.is_alive = true
        this.norm_messages_ = []
        this.rev_messages_ = []

        this.zmq_context = new zmq.Context()

        this.zmq_server_ = new zmq.Router({
            context: this.zmq_context,
            // @ts-ignore
            routingId: this.server_signature
        })
        this.zmq_server_rev_ = new zmq.Router({
            context: this.zmq_context,
            // @ts-ignore
            routingId: this.server_signature_rev
        })
        this.zmq_monitor_ = null
        this.zmq_monitor_thread_ = null
    }

    async bind() {
        await this.zmq_server_.bind(`tcp://${this.ip_address}:${this.port}`)
        await this.zmq_server_rev_.bind(`tcp://${this.ip_address}:${this.port_rev}`)
        await nrpc_ts.sleepAsync(100)
    }

    async get_client_change(timeout_ms: number, expected_clients: Array<number>) {
        const start = new Date().getTime()
        while (true) {
            const client_ids = this.get_client_ids()
            if (!nrpc_ts.areSetsEqual(client_ids, expected_clients)) {
                return true
            }
            if (timeout_ms == 0)
                break

            await nrpc_ts.sleepAsync(50)

            if (new Date().getTime() - start > timeout_ms) {
                break
            }
        }
        return false
    }

    async recv_norm(): Promise<[number, any[]]> {
        while (this.is_alive) {
            // TODO: _recv_norm_step
            if (!this.zmq_server_.readable) {
                await nrpc_ts.sleepAsync(50)
                continue
            }
            
            const req: Buffer[] = await this.zmq_server_.receive()
            if (req[1].toString() == ServerMessage.AddClient) {
                await this._add_client(req)
            }
            else if (req[1].toString() == ServerMessage.ForwardCall) {
                await this._forward_call(req)

            }
            else {
                const client = this.clients.find(x => x.client_signature.equals(req[0]))
                if (!client) {
                    // print(f'Unknown client: {req[0]}')
                    continue
                }
                assert(req.length == 3)
                return [client.client_id, [req[1], req[2]]]
            }
        }

        return [0, null]
    }

    async send_norm(client_id, response) {
        const client = this.clients.find(x => x.client_id == client_id)
        assert(client)
        assert(response.length == 2)
        const resp = [
            client.client_signature,
            response[0],
            response[1]
        ]
        if (is_dictionary_list(resp[2])) {
            resp[2] = JSON.stringify(resp[2])
        }
        await this.zmq_server_.send(resp)
    }

    async send_rev(client_id, request) {
        assert(request.length == 2)
        const client = this.clients.find(x => x.client_id == client_id)
        assert(client, `Unknown client: ${client_id}`)

        if (client.is_lost) {
            // print(f'Old client: {client_id}')
            return
        }

        const req = [
            client.client_signature_rev,
            request[0],
            request[1]
        ]

        if (is_dictionary_list(req[2])) {
            req[2] = JSON.stringify(req[2])
        }

        const peer_state = this.zmq_server_.getPeerState(client.client_signature) + 1;
        const peer_state_rev = this.zmq_server_rev_.getPeerState(client.client_signature_rev) + 1;
        if (peer_state == 0 || peer_state_rev == 0) {
            client.is_lost = true
            // print(f'Lost client: {client_id}')
            return
        }
        await this.zmq_server_rev_.send(req)
    }

    async recv_rev(client_id) {
        const client = this.clients.find(x => x.client_id == client_id)
        assert(client, `Unknown client: ${client_id}`)
        if (client.is_lost) {
            // print(f'Old client: {client_id}')
            return null
        }
        // TODO: _recv_rev_step
        const resp: Buffer[] = await this.zmq_server_rev_.receive()
        assert(resp[0].equals(client.client_signature_rev),
            `Recv_Rev signature mismatch: ${resp[0]}, ${client.client_signature_rev}`)
        return resp[2]
    }

    async _add_client(req) {
        this.next_index += 1
        const req2 = JSON.parse(req[2].toString())
        const client = new ClientInfo({
            client_id: this.next_index,
            client_signature: Buffer.from(req[0]),
            client_signature_rev: Buffer.concat([Buffer.from('rev:'), req[0]]),
            client_metadata: req2,
            connect_time: new Date(),
            is_validated: false,
            is_lost: false,
        })
        this.clients.push(client)

        // console.log('ADDING CLIENT', client.client_signature_rev, nrpc_ts.base64_decode(nrpc_ts.base64_encode(client.client_signature_rev)))
        // console.log('ADDING CLIENT', nrpc_ts.base64_encode(client.client_signature_rev))
        
        const resp = {
            'client_id': client.client_id,
            'client_signature': nrpc_ts.base64_encode(client.client_signature),
            'client_signature_rev': nrpc_ts.base64_encode(client.client_signature_rev),
            'client_metadata': client.client_metadata,
            'server_metadata': this.metadata,
        }

        // print(f'client added: {Fore.MAGENTA}server{Fore.RESET} <-> {Fore.MAGENTA}client:{client.client_id}{Fore.RESET}')

        await this.zmq_server_.send([
            client.client_signature,
            ServerMessage.ClientAdded,
            JSON.stringify(resp)
        ])

        // TODO: why is this necessary
        await nrpc_ts.sleepAsync(100)

        // TODO: check client_signature_rev peer status

        await this.request_lock.runExclusive(async () => {
            // @ts-ignore
            await this.zmq_server_rev_.send([
                client.client_signature_rev,
                ServerMessage.ValidateClient,
                JSON.stringify(resp)
            ])

            const resp2: Buffer[] = await this.zmq_server_rev_.receive()
            assert(resp2[0].equals(client.client_signature_rev),
                `Add_Client signature mismatch: ${resp2[0]}, ${client.client_signature_rev}`)
            assert(resp2[1].toString() == ServerMessage.ClientValidated,
                `Add_Client command mismatch: ${resp2[1]}, ${ServerMessage.ClientValidated}`)
            const resp3 = JSON.parse(resp2[2].toString())
            assert(resp3['client_id'] == client.client_id)
            assert(nrpc_ts.base64_decode(resp3['client_signature']).equals(client.client_signature))
            // print(f'client validated: {Fore.MAGENTA}server{Fore.RESET} <-> {Fore.MAGENTA}client:{client.client_id}{Fore.RESET}')
            client.is_validated = true
        })
    }

    async _track_client() {
        // TODO
    }

    async _recv_norm_step() {
        // TODO
    }

    async _recv_rev_step() {
        // TODO
    }

    async _forward_call(req) {
        const req2 = JSON.parse(req[2].toString())
        assert('client_id' in req2)
        const client_id = req2['client_id']
        const method_name = req2['method_name']
        const method_params = req2['method_params']
        const client1 = this.clients.find(x => x.client_signature.equals(req[0]))
        const client2 = this.clients.find(x => x.client_id == client_id)
        assert(client1)
        assert(client2)

        let res: any = null
        await this.request_lock.runExclusive(async () => {
            await this.send_rev(client_id, [method_name, method_params])
            res = await this.recv_rev(client_id)
            if (res) {
                res = JSON.parse(res.toString())
            }
        })

        // print(f'call forwarded: {Fore.MAGENTA}client:{client1.client_id}{Fore.RESET} <-> {Fore.MAGENTA}server{Fore.RESET} <-> {Fore.MAGENTA}client:{client2.client_id}{Fore.RESET}')

        await this.zmq_server_.send([
            client1.client_signature,
            `fwd_response:${method_name}`,
            JSON.stringify(res)
        ])
    }

    get_client_ids(): Array<number> {
        const result: Array<number> = []
        for (const client of this.clients) {
            if (client.is_lost)
                continue
            if (client.client_signature_rev == null)
                continue
            if (!client.is_validated)
                continue
            const peer_state = this.zmq_server_.getPeerState(client.client_signature) + 1;
            const peer_state_rev = this.zmq_server_rev_.getPeerState(client.client_signature_rev) + 1;
            if (peer_state == 0 || peer_state_rev == 0) {
                client.is_lost = true
                // print(f'Lost client: {client_id}')
                continue
            }
            result.push(client.client_id)
        }
        return result
    }

    get_client_full(): ClientInfo[] {
        return this.clients
    }

    get_client_info(client_id) {
        const client = this.clients.find(x => x.client_id == client_id)
        return client
    }

    add_metadata(obj: object) {
        for (const key in obj) {
            this.metadata[key] = obj[key]
        }
    }

    update() {
        for (const client of this.clients) {
            if (client.is_lost)
                continue
            const peer_state = this.zmq_server_.getPeerState(client.client_signature) + 1;
            const peer_state_rev = this.zmq_server_rev_.getPeerState(client.client_signature_rev) + 1;
            if (peer_state == 0 || peer_state_rev == 0) {
                client.is_lost = true
                // print(f'Lost client: {client_id}')
            }
        }
    }

    async wait() {
        assert(this.zmq_server_)
        // TODO: how to poll typescript's zeromq socket
        while (this.is_alive && !this.zmq_server_.closed) {
            if (this.zmq_server_rev_.closed)
                break
            await nrpc_ts.sleepAsync(50)
        }
    }

    close() {
        const clients = [
            ...this.clients
        ]
        const sockets = [
            this.zmq_monitor_,
            this.zmq_server_,
            this.zmq_server_rev_
        ]

        this.is_alive = false
        this.zmq_server_ = null
        this.zmq_server_rev_ = null
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
    ServerSocket
}