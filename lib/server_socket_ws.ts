/**
 *  Contents:
 * 
 *      ServerSocketWs
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
 *          _get_server
 *          _get_server_rev
 *          _get_peer_state
 *          _get_peer_state_rev
 *          _get_message
 *          get_client_ids
 *          get_client_full
 *          get_client_info
 *          add_metadata
 *          update
 *          wait
 *          close
 */

import {
    LinkedList, Mutex, ServerMessage, SocketMetadataInfo, WebSocketInfo, ClientInfo, is_dictionary_list,
} from './common_base'
import assert from 'assert'
import * as nrpc_ts from './common_base'
import { WebSocket, WebSocketServer } from 'ws';


class ServerSocketWs {
    server_id: number
    ip_address: string
    port: number
    port_rev: number
    socket_name: string
    next_connection: number
    next_index: number
    server_signature: Buffer
    server_signature_rev: Buffer
    clients: Array<ClientInfo>
    clients_ws_: Array<WebSocketInfo>
    clients_ws_rev_: Array<WebSocketInfo>
    metadata: SocketMetadataInfo
    ws_context: any
    ws_server: WebSocketServer
    ws_server_rev: WebSocketServer
    ws_monitor_: any
    ws_monitor_thread_: any
    request_lock: Mutex
    is_alive: boolean
    norm_messages_: LinkedList<Buffer[]>
    rev_messages_: LinkedList<Buffer[]>

    constructor(ip_address: string, port: number, port_rev: number, socket_name: string) {
        this.server_id = 0
        this.ip_address = ip_address
        this.port = port
        this.port_rev = port_rev
        this.socket_name = socket_name
        this.next_connection = 0x10203000
        this.next_index = 0
        this.server_signature = Buffer.from('server:0')
        this.server_signature_rev = Buffer.from('rev:server:0')
        this.clients_ws_ = []
        this.clients_ws_rev_ = []
        this.clients = []
        this.metadata = {
            server_id: 0,
            lang: 'typescript',
            ip_address: ip_address,
            main_port: port,
            main_port_rev: port_rev,
            host: 'unknown',
            socket_name: this.socket_name,
            start_time: new Date().toISOString(),
            server_signature: nrpc_ts.base64_encode(this.server_signature),
            server_signature_rev: nrpc_ts.base64_encode(this.server_signature_rev),
        }

        this.ws_context = null
        this.ws_server = null
        this.ws_server_rev = null
        this.ws_monitor_ = null
        this.ws_monitor_thread_ = null
        this.request_lock = new Mutex()
        this.is_alive = true
        this.norm_messages_ = new LinkedList<Buffer[]>()
        this.rev_messages_ = new LinkedList<Buffer[]>()
    }

    async bind() {
        this.ws_server = new WebSocketServer({ port: this.port });
        this.ws_server_rev = new WebSocketServer({ port: this.port_rev });

        this.ws_server.on('connection', (ws: WebSocket, ws_req: Request) => {
            if (!this.is_alive) {
                return
            }
            assert(ws_req.headers['client-signature'] === undefined)
            this.next_connection += 1
            const signature = Buffer.from([0, 0, 0, 0, 0])
            signature.writeIntBE(this.next_connection, 1, 4)

            const info = new WebSocketInfo()
            info.web_socket = ws
            info.connection_signature = signature
            info.is_closed = false
            info.error = null
            this.clients_ws_.push(info)

            ws.on('message', (buffer: Buffer) => {
                const signature_length = buffer.readIntBE(0, 4)
                const method_length = buffer.readIntBE(4, 4)
                const message_length = buffer.length - signature_length - method_length

                assert(signature_length >= 4)
                assert(method_length >= 5)
                assert(message_length >= 2)
                assert(this.server_signature.equals(buffer.subarray(8, 8 + signature_length)))

                const msg: Buffer[] = [
                    info.connection_signature,
                    buffer.subarray(8 + signature_length, 8 + signature_length + method_length),
                    buffer.subarray(8 + signature_length + method_length),
                ]
                this.norm_messages_.append(msg)
            });

            ws.on('close', () => {
                if (!this.is_alive) {
                    return
                }
                info.is_closed = true
            });

            ws.on('error', (error: Error) => {
                if (!this.is_alive) {
                    return
                }
                info.error = error
                info.is_closed = true
            });
        });

        this.ws_server_rev.on('connection', (ws: WebSocket, ws_req: Request) => {
            let signature = null
            if ('client-signature' in ws_req.headers) {
                //@ts-ignore
                signature = nrpc_ts.base64_decode(ws_req.headers['client-signature'])
            } else {
                const x1 = ws_req.url.indexOf('?client-signature=')
                const x2 = ws_req.url.substring(x1 + '?client-signature='.length)
                assert(x1 > 0)
                signature = nrpc_ts.base64_decode(x2)
            }
            assert(signature)

            const info = new WebSocketInfo()
            info.web_socket = ws
            info.connection_signature = signature
            info.is_closed = false
            info.error = null
            this.clients_ws_rev_.push(info)

            ws.on('message', (buffer: Buffer) => {
                if (!this.is_alive) {
                    return
                }
                const signature_length = buffer.readIntBE(0, 4)
                const method_length = buffer.readIntBE(4, 4)
                const message_length = buffer.length - signature_length - method_length
                assert(signature_length >= 4)
                assert(method_length >= 5)
                assert(message_length >= 2)
                assert(this.server_signature_rev.equals(buffer.subarray(8, 8 + signature_length)))

                const msg: Buffer[] = [
                    info.connection_signature,
                    buffer.subarray(8 + signature_length, 8 + signature_length + method_length),
                    buffer.subarray(8 + signature_length + method_length),
                ]
                this.rev_messages_.append(msg)
            });

            ws.on('close', () => {
                if (!this.is_alive) {
                    return
                }
                info.is_closed = true
            });

            ws.on('error', (error: Error) => {
                if (!this.is_alive) {
                    return
                }
                info.error = error
                info.is_closed = true
            });
        });
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
            if (this.norm_messages_.length == 0) {
                await nrpc_ts.sleepAsync(10)
                continue
            }

            // TODO: _recv_norm_step
            const req: Buffer[] = this.norm_messages_.removeHead()
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
        const server = this._get_server(client.client_signature)
        server.send(this._get_message(resp))
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

        const peer_state = this._get_peer_state(client.client_signature)
        const peer_state_rev = this._get_peer_state_rev(client.client_signature_rev)
        if (peer_state == 0 || peer_state_rev == 0) {
            client.is_lost = true
            // print(f'Lost client: {client_id}')
            return
        }
        const server_rev = this._get_server_rev(req[0])
        server_rev.send(this._get_message(req))
    }

    async recv_rev(client_id) {
        const client = this.clients.find(x => x.client_id == client_id)
        assert(client, `Unknown client: ${client_id}`)
        if (client.is_lost) {
            // print(f'Old client: {client_id}')
            return null
        }
        while (this.rev_messages_.length == 0) {
            await nrpc_ts.sleepAsync(10)
        }
        // TODO: _recv_rev_step
        const resp: Buffer[] = this.rev_messages_.removeHead()
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
        const server = this._get_server(client.client_signature)
        server.send(this._get_message([
            client.client_signature,
            ServerMessage.ClientAdded,
            JSON.stringify(resp)
        ]))

        // TODO: why is this necessary
        await nrpc_ts.sleepAsync(100)

        // TODO: check client_signature_rev peer status

        // Validate reverse direction
        await this.request_lock.runExclusive(async () => {
            const server_rev = this._get_server_rev(client.client_signature_rev)
            server_rev.send(this._get_message([
                client.client_signature_rev,
                ServerMessage.ValidateClient,
                JSON.stringify(resp)
            ]))

            while (this.rev_messages_.length == 0) {
                await nrpc_ts.sleepAsync(10)
            }
            const resp2: Buffer[] = this.rev_messages_.removeHead()
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

        const server = this._get_server(client1.client_signature)
        server.send(this._get_message([
            client1.client_signature,
            `fwd_response:${method_name}`,
            JSON.stringify(res)
        ]))
    }

    _get_server(signature: Buffer): WebSocket {
        const connection = this.clients_ws_.find(item => item.connection_signature.equals(signature))
        assert(connection, `Cannot get server, ${signature}`)
        assert(!connection.is_closed)
        return connection.web_socket
    }

    _get_server_rev(signature: Buffer): WebSocket {
        const connection = this.clients_ws_rev_.find(item => item.connection_signature.equals(signature))
        assert(connection, `Cannot get server rev, ${signature}`)
        assert(!connection.is_closed)
        return connection.web_socket
    }

    _get_peer_state(signature: Buffer): number {
        const connection = this.clients_ws_.find(item => item.connection_signature.equals(signature))
        assert(connection, `Cannot get server, ${signature}`)
        return !connection.is_closed && connection.web_socket.readyState == WebSocket.OPEN ? 1 : 0
    }

    _get_peer_state_rev(signature: Buffer): number {
        const connection = this.clients_ws_rev_.find(item => item.connection_signature.equals(signature))
        assert(connection, `Cannot get server rev, ${signature}`)
        return !connection.is_closed && connection.web_socket.readyState == WebSocket.OPEN ? 1 : 0
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
        // assert(signature_length >= 4)
        // assert(method_length >= 4)
        // assert(signature_length == result.readIntBE(0, 4))
        // assert(method_length == result.readIntBE(4, 4))
        return result
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
            const peer_state = this._get_peer_state(client.client_signature)
            const peer_state_rev = this._get_peer_state_rev(client.client_signature_rev)
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
            const peer_state = this._get_peer_state(client.client_signature)
            const peer_state_rev = this._get_peer_state_rev(client.client_signature_rev)
            if (peer_state == 0 || peer_state_rev == 0) {
                client.is_lost = true
                // print(f'Lost client: {client_id}')
            }
        }
    }

    async wait() {
        assert(this.ws_server)
        // TODO: can serve websocket servers indefinitely
        while (this.is_alive) {
            await nrpc_ts.sleepAsync(50)
        }
    }

    close() {
        const clients = [
            ...this.clients
        ]
        const clients_ws = [
            ...this.clients_ws_,
            ...this.clients_ws_rev_
        ]
        const sockets = [
            this.ws_server,
            this.ws_server_rev
        ]

        this.is_alive = false
        this.clients_ws_ = []
        this.clients_ws_rev_ = []
        this.ws_server = null
        this.ws_server_rev = null
        this.ws_monitor_ = null
        this.ws_monitor_thread_ = null

        for (const item of clients_ws) {
            if (item.web_socket) {
                // try {
                item.web_socket.close()
                // }
                // catch (ex) {
                // }
            }
        }

        for (const item of sockets) {
            // try {
            item.close()
            // }
            // catch (ex) {
            // }
        }
        
        this.ws_context = null
    }

}

export {
    ServerSocketWs
}
