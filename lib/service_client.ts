/**
 *  Contents:
 * 
 *      ServiceClient
 *          constructor
 */
import { g_all_types, g_all_services } from "./common_base"
import { RoutingSocket } from "./routing_socket"
import assert from 'assert'
import * as nrpc_ts from "./common_base"

class ServiceClient {
    routing_socket: RoutingSocket
    clazz: any
    client_id: number

    constructor(routing_socket: RoutingSocket, clazz: any, client_id: number = 0) {
        this.routing_socket = routing_socket
        this.clazz = clazz
        this.client_id = client_id

        assert(clazz.name in this.routing_socket.known_services)

        const service_name = clazz.name
        const server_info = this.routing_socket.known_services[service_name]

        for (var method_name in server_info.methods) {
            const full_name = `${service_name}.${method_name}`
            this[method_name] = async function (req: any): Promise<any> {
                // console.log(`Client call ${service_name}.${method_name2}`)
                if (this.routing_socket.socket_type == nrpc_ts.SocketType.BIND) {
                    return await this.routing_socket.client_call(
                        this.client_id,
                        full_name,
                        req
                    )
    
                } else {
                    return await this.routing_socket.server_call(
                        full_name,
                        req
                    )
    
                }
            }

        }
    }
}


export {
    ServiceClient
}