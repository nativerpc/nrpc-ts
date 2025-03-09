/**
 *  Contents:
 *      
 *      RoutingSocket
 *          constructor
 *          bind
 *          connect
 *          cast
 *          server_thread
 *          client_thread
 *          client_call
 *          forward_call
 *          server_call
 *          _incoming_call
 *          _add_types
 *          _add_server
 *          _get_app_info
 *          _get_schema
 *          _set_schema
 *          _assign_values
 *          _sync_with_server
 *          _sync_with_client
 *          _find_new_fields
 *          _find_new_methods
 *          _find_missing_methods
 *          wait
 *          close
 */

import assert from "assert"
import {
    SocketType,
    ProtocolType,
    FormatType,
    type RoutingSocketOptions,
    ServerMessage,
    RoutingMessage,
    type ApplicationInfo,
    type SchemaInfo,
    g_all_types,
    construct_item,
    type int,
    type float,
    type Dictionary,
    type Type,
    DYNAMIC_OBJECT,
    DYNAMIC_OBJECT_REMOTE,
    assign_values,
    FieldInfo,
    MethodInfo,
    ClassInfo,
    ServiceInfo,
    ServerInfo,
    Thread,
    Mutex,
    sleepAsync,
    is_dictionary_list,
    g_all_services,
    get_simple_type,
    get_remote_type,
} from "./common_base"
import nrpc_ts from './index'


class RoutingSocket {
    socket_type: SocketType
    protocol_type: ProtocolType
    format_type: FormatType
    socket_name: string
    ip_address: string
    port: number
    is_alive: boolean
    server_socket: nrpc_ts.ServerSocket | nrpc_ts.ServerSocketWs
    client_socket: nrpc_ts.ClientSocket | nrpc_ts.ClientSocketWs
    processor: Thread
    known_types: Dictionary<string, ClassInfo>
    known_services: Dictionary<string, ServiceInfo>
    known_servers: Dictionary<string, ServerInfo>
    call_count: int
    do_sync: boolean
    is_ready: boolean

    constructor(options: RoutingSocketOptions) {
        this.socket_type = options.type
        this.protocol_type = options.protocol
        this.format_type = options.format
        this.socket_name = options.name
        this.ip_address = ''
        this.port = options.port ?? 0
        this.is_alive = true
        this.server_socket = null
        this.client_socket = null
        this.processor = null
        this.known_types = {}
        this.known_services = {}
        this.known_servers = {}
        this.call_count = 0
        this.do_sync = false
        this.is_ready = false

        this.known_types[DYNAMIC_OBJECT] = g_all_types[DYNAMIC_OBJECT]

        this._add_types(options.types)

        assert(this.known_types[DYNAMIC_OBJECT].type_name)
    }

    async bind(ip_address: string, port: number) {
        assert (this.socket_type == SocketType.BIND)

        this.ip_address = ip_address
        this.port = port

        if (this.protocol_type == ProtocolType.TCP) {
            this.server_socket = new nrpc_ts.ServerSocket(ip_address, port, port + 10000, this.socket_name)
        }
        else {
            this.server_socket = new nrpc_ts.ServerSocketWs(ip_address, port, port + 10000, this.socket_name)
        }

        await this.server_socket.bind()
        await sleepAsync(100)
        
        this.processor = new Thread(() => this.server_thread())
        this.processor.start()
    }

    async connect(ip_address: string, port: number, wait=true, sync=true) {
        assert (this.socket_type == SocketType.CONNECT)

        this.ip_address = ip_address
        this.port = port

        if (this.protocol_type == ProtocolType.TCP) {
            this.client_socket = new nrpc_ts.ClientSocket(ip_address, port, port + 10000, this.socket_name)
        } else {
            this.client_socket = new nrpc_ts.ClientSocketWs(ip_address, port, port + 10000, this.socket_name)
        }

        this.do_sync = sync
        this.processor = new Thread(() => this.client_thread())
        this.processor.start()

        if (wait) {
            while (!this.is_ready) {
                await sleepAsync(100)
            }
        }
    }

    cast<T>(clazz: new (...args: any[]) => T): T {
        return new nrpc_ts.ServiceClient(this, clazz) as T
    }

    async server_thread() {
        assert(this.socket_type == SocketType.BIND)
        this.is_ready = true
        
        while (this.is_alive) {
            const [client_id, req] = await this.server_socket.recv_norm()
            
            if (!this.is_alive) {
                break
            }
            
            const method_name = req[0].toString()
            const command_parameters = JSON.parse(req[1].toString())

            // print(f"{Fore.BLUE}server{Fore.RESET} received request")
            // print(f"{Fore.BLUE}server{Fore.RESET} responding")

            let resp: any = null
            if (method_name == RoutingMessage.GetAppInfo) {
                resp = await this._get_app_info(command_parameters)
            } else if (method_name == RoutingMessage.GetSchema) {
                resp = await this._get_schema(command_parameters, { active_client_id: client_id })
            } else if (method_name == RoutingMessage.SetSchema) {
                resp = await this._set_schema(command_parameters)
            } else {
                resp = await this._incoming_call(method_name, command_parameters)
            }

            assert(is_dictionary_list(resp))

            await this.server_socket.send_norm(
                client_id,
                [
                    `response:${method_name}`,
                    resp
                ]
            )
        }
    }

    async client_thread() {
        assert(this.socket_type == SocketType.CONNECT)
        await this.client_socket.connect()
        
        if (this.do_sync) {
            assert(this.client_socket.is_validated)
            await this._sync_with_server()
            await this._sync_with_client()
        }

        this.is_ready = true

        while (this.is_alive) {
            const req = await this.client_socket.recv_rev()
            if (!this.is_alive) {
                break
            }
            const method_name = req[0].toString()
            const command_parameters = JSON.parse(req[1].toString())

            // Reverse client is bright red
            // print(f"{Fore.RED}client:{socket.client_id}{Fore.RESET} received request, {method_name}")
            // print(f"{Fore.RED}client:{socket.client_id}{Fore.RESET} responding")

            let resp: any = null
            if (method_name == RoutingMessage.GetAppInfo) {
                resp = await this._get_app_info(command_parameters)
            } else if (method_name == RoutingMessage.GetSchema) {
                resp = await this._get_schema(command_parameters, {})
            } else if (method_name == RoutingMessage.SetSchema) {
                assert(false)
            } else {
                resp = await this._incoming_call(method_name, command_parameters)
            }

            assert(is_dictionary_list(resp))

            await this.client_socket.send_rev([
                `response:${method_name}`,
                resp
            ])
        }
    }

    async client_call(client_id, method_name, params) {
        assert(this.socket_type == SocketType.BIND)
        assert(this.server_socket.get_client_ids().includes(client_id))
        const server_name = method_name.split('.')[0]
        const method_name2 = method_name.split('.')[1]
        const method_name3 = `${server_name}.${method_name2}`
        const is_untyped = is_dictionary_list(params)

        // Using statically typed input/output claseses
        if (!is_untyped) {
            const method_def = this.known_services[server_name].methods[method_name2]
            const req_type = this.known_types[method_def.request_type]
            assert(req_type)
            assert(params instanceof req_type.clazz, `Wrong request type! ${params}, ${req_type.clazz}`)
            const params2 = {}
            this._assign_values(method_def.request_type, params, params2, 1)
            params = params2
        }

        // Server rev is dark red
        // print(f"{Style.DIM}{Fore.RED}server{Fore.RESET}{Style.NORMAL} sending request")

        let res: any = null
        await this.server_socket.request_lock.runExclusive(async () => {
            await this.server_socket.send_rev(
                client_id,
                [method_name3, params]
            )
            res = await this.server_socket.recv_rev(client_id)
            if (res) {
                res = JSON.parse(res.toString())
            }
        })

        // Using statically typed input/output claseses
        if (!is_untyped) {
            const method_def = this.known_services[server_name].methods[method_name2]
            const res_type = this.known_types[method_def.response_type]
            assert(res_type)
            assert(params instanceof res_type.clazz, `Wrong request type! ${params}, ${res_type.clazz}`)
            const res2 = new res_type.clazz()
            this._assign_values(method_def.response_type, res2, res, 0)
            res = res2
        }

        return res
    }

    async forward_call(client_id, method_name, params) {
        assert(this.socket_type == SocketType.CONNECT)
        return await this.server_call(
            ServerMessage.ForwardCall,
            {
                client_id: client_id,
                method_name: method_name,
                method_params: params
            }
        )
    }

    async server_call(method_name, params) {
        assert(this.socket_type == SocketType.CONNECT)
        assert(typeof (method_name) == 'string')

        this.call_count += 1
        // print(f'Calling {this.call_count}, {server_name}.{method_name}') #, {req_data}')
        const server_name = method_name.split('.')[0]
        const method_name2 = method_name.split('.')[1]
        const method_name3 = `${server_name}.${method_name2}`
        const is_untyped = is_dictionary_list(params)

        // Using statically typed input/output claseses
        if (!is_untyped) {
            const method_def = this.known_services[server_name].methods[method_name2]
            const req_type = this.known_types[method_def.request_type]
            assert(req_type)
            assert(params instanceof req_type.clazz, `Wrong request type! ${params}, ${req_type.clazz}`)
            const params2 = {}
            this._assign_values(method_def.request_type, params, params2, 1)
            params = params2
        }

        let res: any = null
        await this.client_socket.request_lock.runExclusive(async () => {
            await this.client_socket.send_norm([
                method_name3, params
            ])
            res = await this.client_socket.recv_norm()
            if (res) {
                res = JSON.parse(res.toString())
            }
        })

        // Using statically typed input/output claseses
        if (!is_untyped) {
            const method_def = this.known_services[server_name].methods[method_name2]
            const res_type = this.known_types[method_def.response_type]
            assert(res_type)
            const res2 = new res_type.clazz()
            this._assign_values(method_def.response_type, res2, res, 0)
            res = res2
            assert(res instanceof res_type.clazz, `Wrong request type! ${params}, ${res_type.clazz}`)
        }

        return res
    }

    async _incoming_call(method_name: string, request_data: any): Promise<any> {
        this.call_count += 1
        // print(f'Calling {this.call_count}, {this.socket_type}, {method_name}')

        const parts = method_name.split('.')
        assert(parts.length == 2)
        assert(parts[0] in this.known_servers)
        assert(parts[0] in this.known_services)
        assert(is_dictionary_list(request_data))

        if (!(parts[0] in this.known_servers) ||
            !(parts[0] in this.known_services)) {
            assert(parts[0] in this.known_services)
            if (parts[0] in this.known_services) {
                const service_info = this.known_services[parts[0]]
                if (!service_info.service_errors) {
                    service_info.service_errors = `\nFailed invokation: ${method_name}`
                }
            }
            return {}
        }

        const server = this.known_servers[parts[0]]
        const service_info = this.known_services[parts[0]]

        if (!(parts[1] in service_info.methods) ||
            !(parts[1] in server.instance.__proto__) ||
            service_info.methods[parts[1]].method_errors) {
            if (parts[1] in service_info.methods) {
                const method1 = service_info.methods[parts[1]]
                const request_type = method1.request_type
                const response_type = method1.response_type
                if (!method1.method_errors) {
                    method1.method_errors = `\nFailed invokation: ${method_name}`
                }
                return response_type.endsWith('[]') ? [] : {}
            } else {
                if (!service_info.service_errors) {
                    service_info.service_errors = `\nFailed invokation: ${method_name}`
                }
                return {}
            }
        }

        const method1 = service_info.methods[parts[1]]
        const method2 = server.instance.__proto__[parts[1]]
        const request_type = method1.request_type
        const response_type = method1.response_type

        assert(request_type)

        const data_obj = new this.known_types[request_type].clazz()
        this._assign_values(request_type, data_obj, request_data, 0)

        const result_obj = await method2.apply(server.instance, [data_obj])

        const result_data = response_type.endsWith('[]') ? [] : {}
        this._assign_values(response_type, result_obj, result_data, 1)

        return result_data
    }

    _add_types(types: {[name: string]: any}) {
        for (var [name, item] of Object.entries(types)) {
            const clazz = item instanceof Array ? item[0] : item
            const type_name = clazz.name
            const server_instance = item instanceof Array ? item[1] : null
            assert(type_name == name)
            if (type_name in this.known_types ||
                type_name in this.known_services ||
                type_name in this.known_servers
            ) {
                continue
            }

            if (type_name in g_all_types) {
                assert(g_all_types[type_name].fields)
                const type_info = g_all_types[type_name]
                this.known_types[type_name] = new ClassInfo({
                    type_name: type_name,
                    fields: {...type_info.fields},
                    size: type_info.size,
                    local: true,
                    clazz: clazz,
                })
            }
            else if (type_name in g_all_services) {
                assert(g_all_services[type_name].methods)
                const service_info = g_all_services[type_name]
                this.known_services[type_name] = new ServiceInfo({
                    service_name: type_name,
                    methods: {...service_info.methods},
                    local: true,
                    clazz: clazz
                })

                if (server_instance) {
                    this._add_server(clazz, server_instance)
                }
            }
            else {
                assert(false, `Missing metadata: ${type_name}`)
            }
        }
    }

    _add_server(server_type, server_instance) {
        const server_name = server_instance.constructor.name
        const service_name = server_type.name
        const service_info = this.known_services[service_name]
        assert(service_name in this.known_services, `Unknown server type! ${service_name}`)
        const methods: Dictionary<string, MethodInfo> = {}
        assert(service_info.methods)
        server_instance['clazz'] = service_info.clazz

        for (const [method_name, method_info] of Object.entries(service_info.methods)) {
            const method_info2 = g_all_services[service_name].methods[method_info.method_name]
            const req_type = method_info2.request_type
            const res_type = method_info2.response_type
            const req_type_nl = req_type.endsWith('[]') ? req_type.substring(0, req_type.length - 2) : req_type
            const res_type_nl = res_type.endsWith('[]') ? res_type.substring(0, res_type.length - 2) : res_type
            const method2 = server_instance.__proto__[method_name]

            //     assert(req_type == method_info.request_type,
            //         `Server signature mismatch in request! ${server_name}, ${method_info.method_name}, ${req_type}, ${method_info.request_type}`)
            //     assert(res_type == method_info.response_type,
            //         `Server signature mismatch in response! ${server_name}, ${method_info.method_name}, ${res_type}, ${method_info.response_type}`)

            if (!(method_name in server_instance.__proto__)) {
                method_info.method_errors += (
                    `\nServer method missing! ${server_name}, ${method_info.method_name}, ${req_type}, ${method_info.request_type}`
                )
                continue
            }
            if (!(req_type_nl in this.known_types)) {
                method_info.method_errors += (
                    `\nUnknown parameter type! ${method_info.method_name}, ${req_type}`
                )
                continue
            }
            if (!(res_type_nl in this.known_types)) {
                method_info.method_errors += (
                    `\nUnknown return type! ${method_info.method_name}, ${res_type}`
                )
                continue
            }
                    
            methods[method_name] = new MethodInfo({
                method_name: method_name,
                request_type: req_type,
                response_type: res_type,
                id_value: method_info.id_value,
                local: true
            })
        }

        const server_info = new ServerInfo({
            server_name: server_name,
            service_name: service_name,
            methods: methods,
            instance: server_instance,
        })
        
        this.known_servers[service_name] = server_info
    }

    async _get_app_info(req: any): Promise<ApplicationInfo> {
        let this_socket = ''
        if (this.socket_type == SocketType.BIND) {
            this_socket = `${this.server_socket.port}`
        } else {
            this_socket = `${this.client_socket.port}:${this.client_socket.client_id}`
        }

        let client_ids = []
        if (this.socket_type == SocketType.BIND) {
            client_ids = this.server_socket.get_client_ids()
        }

        let clients = []
        if (this.socket_type == SocketType.BIND && req.with_clients) {
            for (const item of this.server_socket.clients) {
                clients.push({
                    client_id: item.client_id,
                    is_validated: item.is_validated,
                    is_lost: item.is_lost,
                    socket_name: item.client_metadata['socket_name'],
                })
            }
        }

        const result: ApplicationInfo = {
            server_id: this.port,
            client_id: this.socket_type == SocketType.BIND ? 0 : this.client_socket.client_id,
            is_alive: this.is_alive,
            is_ready: this.is_ready,
            socket_type: this.socket_type.toString(),
            protocol_type: this.protocol_type.toString(),
            types: Object.keys(this.known_types).length,
            services: Object.keys(this.known_services).length,
            servers: Object.keys(this.known_servers).length,
            metadata: this.socket_type == SocketType.CONNECT ? this.client_socket.server_metadata : this.server_socket.metadata,
            this_socket: this_socket,
            client_count: this.socket_type == SocketType.CONNECT ? 0 : this.server_socket.clients.length,
            clients: clients,
            client_ids: client_ids,
            socket_name: this.socket_name,
            ip_address: this.ip_address,
            port: this.port,
            format: 'json',
        }
        return result
    }

    async _get_schema(req: any, { active_client_id }: { active_client_id?: number }): Promise<SchemaInfo> {
        const types = []
        for (const [key, value] of Object.entries(this.known_types)) {
            if (key == DYNAMIC_OBJECT) {
                continue
            }
            types.push({
                type_name: key,
                size: -1,
                fields: value.fields.length,
                local: value.local,
                type_errors: value.type_errors,
            })
        }

        const fields = []
        for (const [key, value] of Object.entries(this.known_types)) {
            if (key == DYNAMIC_OBJECT) {
                continue
            }
            for (const [key2, field2] of Object.entries(value.fields)) {
                assert(field2.field_type)
                fields.push({
                    type_name: key,
                    field_name: field2.field_name,
                    field_type: get_remote_type(field2.field_type),
                    id_value: field2.id_value,
                    offset: -1,
                    size: -1,
                    local: field2.local,
                    field_errors: field2.field_errors,
                })
                assert(key2 == field2.field_name)
            }
        }

        const services = []
        for (const [service_name, service_info] of Object.entries(this.known_services)) {
            services.push({
                service_name: service_info.service_name,
                methods: service_info.methods.length,
                local: service_info.local,
                has_server: service_info.service_name in this.known_servers,
                service_errors: service_info.service_errors,
            })
            assert(service_name == service_info.service_name)
        }

        const methods = []
        for (const [service_name, service_info] of Object.entries(this.known_services)) {
            for (const [method_name, method_info] of Object.entries(service_info.methods)) {
                methods.push({
                    service_name: service_info.service_name,
                    method_name: method_name,
                    request_type: get_remote_type(method_info.request_type),
                    response_type: get_remote_type(method_info.response_type),
                    id_value: method_info.id_value,
                    local: method_info.local,
                    method_errors: method_info.method_errors,
                })
            }
        }

        const clients = []
        if (this.socket_type == SocketType.BIND) {
            this.server_socket.update()
            for (const item of this.server_socket.clients) {
                clients.push({
                    main_port: this.server_socket.port,
                    client_id: item.client_id,
                    is_validated: item.is_validated,
                    is_lost: item.is_lost,
                    socket_name: item.client_metadata['socket_name'],
                    client_metadata: item.client_metadata,
                })
            }
        }

        const servers = []
        if (this.socket_type == SocketType.CONNECT) {
            servers.push({
                port: this.client_socket.port,
                socket_name: this.client_socket.server_metadata['socket_name'],
                server_metadata: this.client_socket.server_metadata,
            })
        }

        let this_socket = ''
        if (this.socket_type == SocketType.BIND) {
            this_socket = `${this.server_socket.port}`
        } else {
            this_socket = `${this.client_socket.port}:${this.client_socket.client_id}`
        }

        const result: SchemaInfo = {
            server_id: this.port,
            client_id: this.socket_type == SocketType.BIND ? 0 : this.client_socket.client_id,
            types: types,
            services: services,
            fields: fields,
            methods: methods,
            metadata: this.socket_type == SocketType.BIND ? this.server_socket.metadata : this.client_socket.metadata,
            active_client: active_client_id ?? 0,
            this_socket: this_socket,
            clients: clients,
            servers: servers,
            socket_name: this.socket_name,
        }
        return result
    }

    async _set_schema(req: any): Promise<SchemaInfo> {
        const added1 = this._find_new_fields(req, true)
        const added2 = this._find_new_methods(req, true)

        // console.log(f'Sync ready: 1, {len(added1)}, {len(added2)}')

        return this._get_schema(req, {})
    }

    _assign_values(type_name: string, obj_data: any, json_data: any, target: number) {
        assign_values(type_name, obj_data, json_data, target)
    }

    async _sync_with_server() {
        const res = await this.server_call(RoutingMessage.GetSchema, {})
        this._find_missing_methods(res)
        const added1 = this._find_new_fields(res, true)
        const added2 = this._find_new_methods(res, true)
        // console.log(`    With server: #${connection.connection_id}, ${to_add1.length}, ${to_add3.length}`)
    }

    async _sync_with_client() {
        const req = await this._get_schema({}, {})
        const res = await this.server_call(RoutingMessage.SetSchema, req)
        const added1 = this._find_new_fields(res, false)
        const added2 = this._find_new_methods(res, false)
        assert(added1.length == 0)
        assert(added2.length == 0)
        // print(f'Sync ready: 3, {len(added1)}, {len(added2)}')
    }

    _find_new_fields(schema, do_add) {
        var to_add = []
        for (var server_type_info of schema.types) {
            const type_name = server_type_info.type_name
            const type_fields = schema.fields.filter(x => x.type_name == type_name)
            if (!(type_name in this.known_types)) {

            } else {
                var my_type_info = this.known_types[type_name]
                for (var field_info of type_fields) {
                    assert(field_info.field_type)
                    var field_name = field_info.field_name
                    assert(field_info.id_value > 0)
                    if (!(field_name in my_type_info.fields)) {
                        for (var [key2, item2] of Object.entries(my_type_info.fields)) {
                            if (item2.id_value == field_info.id_value) {
                                item2.field_errors += (
                                    `\nDuplicate id! ${type_name}.${field_name}, ${key2}=${item2.id_value}`
                                )
                                continue
                            }
                        }
                        to_add.push({
                            type_name: type_name,
                            field_name: field_name,
                            field_type: get_remote_type(field_info.field_type),
                            id_value: field_info.id_value
                        })
                    }
                    else {
                        assert(field_name in my_type_info.fields)
                        if (field_info.id_value != my_type_info.fields[field_name].id_value) {
                            my_type_info.fields[field_name].field_errors += (
                                `\nField numbering mismatch id! ${type_name}.${field_name}, ${field_info.id_value}, ${my_type_info.fields[field_name].id_value}`
                            )
                            continue
                        }
                    }
                }
            }
        }

        // Add missing fields
        //
        if (do_add) {
            for (const item of to_add) {
                const known_fields = this.known_types[item.type_name]
                assert(known_fields)
                assert(item.type_name)
                known_fields.fields[item.field_name] = new FieldInfo({
                    field_name: item.field_name,
                    field_type: item.field_type,
                    id_value: item.id_value,
                    offset: -1,
                    size: -1,
                    local: false
                })
                assert(item.type_name in this.known_types)
            }
        }

        return to_add
    }

    _find_new_methods(schema, do_add) {
        var to_add = []
        for (var server_service_info of schema.services) {
            const service_name = server_service_info.service_name
            const service_methods = schema.methods.filter(x => x.service_name == service_name)

            if (!(service_name in this.known_services)) {

            }
            else {
                var my_service_info = this.known_services[service_name]
                for (var method_info of service_methods) {
                    assert('id_value' in method_info)
                    if (!(method_info.method_name in my_service_info.methods)) {
                        for (var [key2, item2] of Object.entries(my_service_info.methods)) {
                            if (item2.id_value == method_info.id_value) {
                                method_info.method_errors += (
                                    `\nDuplicate id! ${service_name}.${method_info.method_name}, ${key2}, ${item2.id_value}`
                                )
                                continue
                            }
                        }
                        to_add.push({
                            service_name: service_name,
                            method_name: method_info.method_name,
                            id_value: method_info.id_value,
                            request_type: get_remote_type(method_info.request_type),
                            response_type: get_remote_type(method_info.response_type),
                        })
                    }
                    else {
                        if (method_info.id_value != my_service_info.methods[method_info.method_name].id_value) {
                            method_info.method_errors += (
                                `\nMethod numbering mismatch! ${service_name}.${method_info.method_name}, ` +
                                `${method_info.id_value}, ${my_service_info.methods[method_info.method_name].id_value}`
                            )
                            continue
                        }
                    }
                }
            }
        }

        // Add missing methods
        //
        if (do_add) {
            for (const item of to_add) {
                this.known_services[item.service_name].methods[item.method_name] = new MethodInfo({
                    method_name: item.method_name,
                    request_type: item.request_type,
                    response_type: item.response_type,
                    id_value: item.id_value,
                    local: false
                })
            }
        }
        return to_add
    }

    _find_missing_methods(schema) {
        for (const [service_name, service_info] of Object.entries(this.known_services)) {
            const server_service_info = schema.services.find(x => x.service_name == service_name)
            const remote_service_methods = schema.methods.filter(x => x.service_name == service_name)
            if (!server_service_info) {
                service_info.service_errors += (
                    `\nMissing remote service! ${service_name}`
                )
                continue
            }
            for (var [method_name, method_info] of Object.entries(service_info.methods)) {
                assert(method_info)
                var server_method = remote_service_methods.find(x => x.method_name == method_name)
                if (!server_method) {
                    service_info.service_errors += (
                        `\nMissing remote service! ${service_name}.${method_name}`
                    )
                    continue
                }
            }
        }
    }

    async wait() {
        if (this.socket_type == SocketType.BIND) {
            await this.server_socket.wait()
        } else {
            await this.client_socket.wait()
        }
        this.close()
    }

    close() {
        this.is_alive = false
        if (this.socket_type == SocketType.BIND) {
            this.server_socket.is_alive = false
        } else {
            this.client_socket.is_alive = false
        }
        this.processor.join()
        if (this.socket_type == SocketType.BIND) {
            this.server_socket.close()
        } else {
            this.client_socket.close()
        }
        this.server_socket = null
        this.client_socket = null
    }
}

export {
    RoutingSocket
}
