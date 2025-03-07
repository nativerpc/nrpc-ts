/**
 * Contents:
 *      exports
 */
export {
    type int,
    type float,
    type Dict,
    type ReadOnlyDict,
    type Dictionary,
    type Type,
    LinkedList,
    annotation_name,
    annotation_final_compiler,

    SocketType,
    ProtocolType,
    FormatType,
    type RoutingSocketOptions,
    ServerMessage,
    RoutingMessage,
    WebSocketInfo,
    type SocketMetadataInfo,
    ClientInfo,
    type ApplicationInfo,
    type SchemaInfo,

    FieldInfo,
    MethodInfo,
    ClassInfo,
    ServiceInfo,
    ServerInfo,

    g_all_types,
    g_all_services,
    FieldType,
    TypeNames,
    DYNAMIC_OBJECT,
    type ClassDescription,

    construct_item,
    destroy_item,
    register_class,
    rpcclass,
    construct_json,
    assign_values,
    get_class_string,
    get_simple_type,

    init,
    CommandLine,
    Mutex,
    Thread,
    sleepAsync,
    base64_encode,
    base64_decode,
    is_dictionary,
    is_dictionary_list,
    areSetsEqual,
    execCommand,

    type ServingSocketOptions,
    type ServingSocketClientInfo,
} from './common_base'


export { ClientSocket } from './client_socket'
export { ServerSocket } from './server_socket'
export { ClientSocketWs } from './client_socket_ws'
export { ServerSocketWs } from './server_socket_ws'
import { ServiceClient } from './service_client';
import { ServingSocket } from './serving_socket';
export { RoutingSocket } from './routing_socket';

import * as common_base from './common_base'
import * as server_socket from './server_socket'
import * as client_socket from './client_socket'
import * as server_socket_ws from './server_socket_ws'
import * as client_socket_ws from './client_socket_ws'
import * as service_client from './service_client';
import * as serving_socket from './serving_socket';
import * as routing_socket from './routing_socket';

namespace nrpc_ts {
    export import LinkedList = common_base.LinkedList
    export import annotation_name = common_base.annotation_name
    export import annotation_final_compiler = common_base.annotation_final_compiler

    export import SocketType = common_base.SocketType
    export import ProtocolType = common_base.ProtocolType
    export import FormatType = common_base.FormatType
    export import ServerMessage = common_base.ServerMessage
    export import RoutingMessage = common_base.RoutingMessage
    export import WebSocketInfo = common_base.WebSocketInfo
    export import ClientInfo = common_base.ClientInfo
    export type ApplicationInfo = common_base.ApplicationInfo
    export type SchemaInfo = common_base.SchemaInfo

    export import FieldInfo = common_base.FieldInfo
    export import MethodInfo = common_base.MethodInfo
    export import ClassInfo = common_base.ClassInfo
    export import ServiceInfo = common_base.ServiceInfo
    export import ServerInfo = common_base.ServerInfo

    export import g_all_types = common_base.g_all_types
    export import g_all_services = common_base.g_all_services
    export import FieldType = common_base.FieldType
    export import TypeNames = common_base.TypeNames
    export import DYNAMIC_OBJECT = common_base.DYNAMIC_OBJECT
    // export import ClassDescription = common_base.ClassDescription

    export import construct_item = common_base.construct_item
    export import destroy_item = common_base.destroy_item
    export import register_class = common_base.register_class
    export import rpcclass = common_base.rpcclass
    export import construct_json = common_base.construct_json
    export import assign_values = common_base.assign_values
    export import get_class_string = common_base.get_class_string
    export import get_simple_type = common_base.get_simple_type

    export import init = common_base.init
    export import CommandLine = common_base.CommandLine
    export import Mutex = common_base.Mutex
    export import Thread = common_base.Thread
    export import sleepAsync = common_base.sleepAsync
    export import base64_encode = common_base.base64_encode
    export import base64_decode = common_base.base64_decode
    export import is_dictionary = common_base.is_dictionary
    export import is_dictionary_list = common_base.is_dictionary_list
    export import areSetsEqual = common_base.areSetsEqual
    export import execCommand = common_base.execCommand
    export type ServingSocketOptions = common_base.ServingSocketOptions
    export type ServingSocketClientInfo = common_base.ServingSocketClientInfo

    export import ServerSocket = server_socket.ServerSocket
    export import ClientSocket = client_socket.ClientSocket
    export import ServerSocketWs = server_socket_ws.ServerSocketWs
    export import ClientSocketWs = client_socket_ws.ClientSocketWs
    export import ServiceClient = service_client.ServiceClient
    export import ServingSocket = serving_socket.ServingSocket
    export import RoutingSocket = routing_socket.RoutingSocket
}

export default nrpc_ts