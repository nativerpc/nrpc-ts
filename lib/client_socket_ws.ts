/**
 *   Contents:
 *
 *       ClientSocketWs
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
 *           _get_message
 *           add_metadata
 *           is_validated
 *           wait
 *           close
 */

import { LinkedList, Mutex, ServerMessage, SocketMetadataInfo, is_dictionary_list } from './common_base'
import assert from 'assert'
import * as nrpc_ts from './common_base'
import * as ws from 'ws';

if (typeof (WebSocket) !== 'undefined') {
    (global as any).WebSocket = WebSocket
} else {
    (global as any).WebSocket = ws.WebSocket
}

class ClientSocketWs {
    client_id: number
    ip_address: string
    port: number
    port_rev: number
    socket_name: string
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
    ws_context: any
    ws_client: WebSocket
    ws_client_rev: WebSocket
    ws_monitor_: any
    ws_monitor_thread_: any
    request_lock: Mutex
    norm_messages_: LinkedList<Buffer[]>
    rev_messages_: LinkedList<Buffer[]>

    constructor(ip_address, port, port_rev, socket_name) {
        this.client_id = 0
        this.ip_address = ip_address
        this.port = port
        this.port_rev = port_rev
        this.socket_name = socket_name
        this.server_signature = Buffer.from('server:0')
        this.server_signature_rev = Buffer.from('rev:server:0')
        // @ts-ignore
        this.client_signature = null
        // @ts-ignore
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
            socket_name: this.socket_name,
            start_time: new Date().toISOString(),
            client_signature: null,
            client_signature_rev: null,
        }
        this.server_metadata = null
        this.ws_context = null
        this.ws_client = null
        this.ws_client_rev = null
        this.ws_monitor_ = null
        this.ws_monitor_thread_ = null
        this.request_lock = new Mutex()
        this.norm_messages_ = new LinkedList<Buffer[]>()
        this.rev_messages_ = new LinkedList<Buffer[]>()
    }

    async connect() {
        assert(!this.is_validated_)

        this.ws_client = new WebSocket(`ws://${this.ip_address}:${this.port}`)
        
        this.ws_client.addEventListener('open', () => {
            this._track_client('open', '')
        });

        this.ws_client.addEventListener('message', async (event: MessageEvent) => {
            const buffer = event.data instanceof Buffer ? event.data : Buffer.from(await event.data.arrayBuffer())
            
            const signature_length = buffer.readIntBE(0, 4)
            const method_length = buffer.readIntBE(4, 4)
            const message_length = buffer.length - signature_length - method_length

            assert(signature_length >= 4)
            assert(method_length >= 5)
            assert(message_length >= 2)
            if (this.client_signature) {
                assert(this.client_signature.equals(buffer.subarray(8, 8 + signature_length)))
            }

            const msg: Buffer[] = [
                this.server_signature,
                buffer.subarray(8 + signature_length, 8 + signature_length + method_length),
                buffer.subarray(8 + signature_length + method_length),
            ]
            this.norm_messages_.append(msg)
        });
        this.ws_client.addEventListener('error', (error: any) => {
            this._track_client('error', error)
        });
        this.ws_client.addEventListener('close', error => {
            this._track_client('close', error)
        });

        while (this.ws_client.readyState != WebSocket.OPEN) {
            await nrpc_ts.sleepAsync(50)
        }
        while (!this.is_connected) {
            await nrpc_ts.sleepAsync(50)
        }

        // @ts-ignore
        let resp: Buffer[] = null
        await this.request_lock.runExclusive(async () => {
            const sent = this.ws_client.send(this._get_message([
                this.server_signature,
                ServerMessage.AddClient,
                JSON.stringify(this.metadata)
            ]))
            // @ts-ignore
            assert(!(sent instanceof Promise))
            while (this.is_alive && this.norm_messages_.length == 0) {
                await nrpc_ts.sleepAsync(10)
            }
            if (!this.is_alive) {
                return
            }
            resp = this.norm_messages_.removeHead()
        })

        assert(resp)
        assert(resp.length == 3)
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

        const client_signature_arg = `client-signature=${nrpc_ts.base64_encode(this.client_signature_rev)}`
        this.ws_client_rev = new WebSocket(
            `ws://${this.ip_address}:${this.port_rev}/?${client_signature_arg}`,
        );
        this.ws_client_rev.addEventListener('open', () => {
        });
        // @ts-ignore
        this.ws_client_rev.addEventListener('message', async (event: MessageEvent) => {
            // @ts-ignore
            const buffer = event.data instanceof Buffer ? event.data : Buffer.from(await event.data.arrayBuffer())
            
            const signature_length = buffer.readIntBE(0, 4)
            const method_length = buffer.readIntBE(4, 4)
            const message_length = buffer.length - signature_length - method_length

            assert(signature_length >= 4)
            assert(method_length >= 5)
            assert(message_length >= 2)
            if (this.client_signature_rev) {
                assert(this.client_signature_rev.equals(buffer.subarray(8, 8 + signature_length)))
            }

            const msg: Buffer[] = [
                this.server_signature_rev,
                buffer.subarray(8 + signature_length, 8 + signature_length + method_length),
                buffer.subarray(8 + signature_length + method_length),
            ]
            this.rev_messages_.append(msg)
        });
        this.ws_client_rev.addEventListener('error', (error: any) => {
            this.is_lost = true
            this.client_errors += `\n${error}`
        });
        this.ws_client_rev.addEventListener('close', error => {
            this.is_lost = true
        });

        while (this.ws_client_rev.readyState != WebSocket.OPEN) {
            await nrpc_ts.sleepAsync(50)
        }

        // console.log('ADDED CLIENT', this.client_signature_rev, this.client_signature_rev.toString(), resp[0].toString())

        while (this.is_alive) {
            if (this.rev_messages_.length == 0) {
                await nrpc_ts.sleepAsync(10)
                continue
            }
            const req = this.rev_messages_.removeHead()
            assert(req.length == 3)
            if (req[1].toString() == ServerMessage.ValidateClient) {
                await this._validate_client(req)
                break
            } else {
                console.log('Early message on client side!')
                const method_name = req[1].toString()
                this.ws_client_rev.send(this._get_message([
                    this.server_signature_rev,
                    `message_dropped:${method_name}`,
                    JSON.stringify({ 'error': 'Early message dropped' })
                ]))
            }
        }
        assert(this.is_validated_)
    }

    async send_norm(request) {
        assert(this.ws_client_rev)
        const req = [
            this.server_signature,
            request[0],
            request[1],
        ]
        if (is_dictionary_list(req[2])) {
            req[2] = JSON.stringify(req[2])
        }
        this.ws_client.send(this._get_message(req))
    }

    async recv_norm() {
        while (this.is_alive && this.norm_messages_.length == 0) {
            await nrpc_ts.sleepAsync(10)
        }
        if (!this.is_alive) {
            return null
        }
        const resp = this.norm_messages_.removeHead()
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
            if (this.rev_messages_.length == 0) {
                await nrpc_ts.sleepAsync(50)
                if (timeout_ms > 0 && new Date().getTime() - started > timeout_ms) {
                    break
                }
                continue
            }
            // TODO: _recv_rev_step
            req = this.rev_messages_.removeHead()

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
        assert(this.ws_client_rev)
        assert(response.length == 2)
        const resp = [
            this.server_signature_rev,
            response[0],
            response[1]
        ]

        if (is_dictionary_list(resp[2])) {
            resp[2] = JSON.stringify(resp[2])
        }

        this.ws_client_rev.send(this._get_message(resp))
    }

    async _validate_client(req) {
        assert(req[0].equals(this.server_signature_rev))
        const req2 = JSON.parse(req[2].toString())
        assert(this.client_id == req2['client_id'])
        assert(this.client_signature.equals(nrpc_ts.base64_decode(req2['client_signature'])))
        assert(this.client_signature_rev.equals(nrpc_ts.base64_decode(req2['client_signature_rev'])))
        this.server_metadata = req2['server_metadata']
        this.ws_client_rev.send(this._get_message([
            this.server_signature_rev,
            ServerMessage.ClientValidated,
            JSON.stringify(this.metadata)
        ]))
        this.is_validated_ = true
    }

    async _track_client(event_id, text) {
        if (event_id == 'open') {
            this.is_connected = true
        }
        else if (event_id == 'close') {
            this.is_lost = true
        }
        else if (event_id == 'error') {
            this.is_lost = true
            this.client_errors += `\n${text}`
        }
    }

    _recv_norm_step() {
        // TODO
    }

    _recv_rev_step() {
        // TODO
    }

    _get_message(items: any[]): Buffer {
        assert(items.length == 3)
        if (!(items[0] instanceof Buffer)) {
            items[0] = Buffer.from(items[0])
        }
        if (!(items[1] instanceof Buffer)) {
            items[1] = Buffer.from(items[1])
        }
        if (!(items[2] instanceof Buffer)) {
            items[2] = Buffer.from(items[2])
        }
        const result = Buffer.concat([
            Buffer.from([0, 0, 0, 0]),
            Buffer.from([0, 0, 0, 0]),
            items[0],
            items[1],
            items[2],
        ])
        result.writeIntBE(items[0].length, 0, 4)
        result.writeIntBE(items[1].length, 4, 4)
        return result
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
        while (this.is_alive && !this.is_lost && this.ws_client.readyState == WebSocket.OPEN) {
            await nrpc_ts.sleepAsync(50)
        }
    }

    close() {
        const sockets = [
            this.ws_monitor_,
            this.ws_client,
            this.ws_client_rev
        ]

        this.is_alive = false
        this.ws_client = null
        this.ws_client_rev = null
        this.ws_monitor_ = null
        this.ws_monitor_thread_ = null
        
        for (const item of sockets) {
            if (item) {
                // try {
                item.close()
                //     }
                //     catch (ex) {
                //     }
            }
        }

        this.ws_context = null
    }

}

export {
    ClientSocketWs
}