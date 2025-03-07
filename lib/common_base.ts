/**
 *  Contents:
 * 
 *      SocketType
 *      ProtocolType
 *      FormatType
 *      RoutingSocketOptions
 *      ServerMessage
 *      RoutingMessage
 *      WebSocketInfo
 *      SocketMetadataInfo
 *      ClientInfo
 *      ApplicationInfo
 *      SchemaInfo
 *      FieldType
 *      FieldNames
 *      DYNAMIC_OBJECT
 *          Also: int, float, Dict, Type, etc
 *      FieldInfo
 *      MethodInfo
 *      ClassInfo
 *      ServiceInfo
 *      ServerInfo
 *
 *      g_all_types
 *      g_all_services
 *      ClassDescription
 *      register_class
 *      rpcclass
 * 
 *      construct_item
 *      destroy_item
 *      construct_json
 *      assign_values
 *      get_class_string
 *      get_simple_type
 *
 *      init
 *      CommandLine
 *      is_number
 *      find
 *      find_all
 *      check_serializable
 *      Mutex
 *      Thread
 *      sleepAsync
 *      base64_encode
 *      base64_decode
 *      is_dictionary
 *      is_dictionary_list
 *      areSetsEqual
 *      execCommand
 *      
 *      ServingSocketOptions
 *      ServingSocketClientInfo
 */
import assert from 'assert'
import { WebSocket } from 'ws';
import {
    type int,
    type float,
    type Dict,
    type ReadOnlyDict,
    type Dictionary,
    type Type,
    LinkedList,
    annotation_name,
    annotation_final_compiler,
} from '../lang/common_base'
import child_process from 'child_process'

enum SocketType {
    BIND = 'BIND',
    CONNECT = 'CONNECT'
}

enum ProtocolType {
    TCP = 'TCP',
    WS = 'WS',
    HTTP = 'HTTP',
}

enum FormatType {
    BINARY = 'BINARY',
    JSON = 'JSON',
}

interface RoutingSocketOptions {
    type: SocketType
    protocol: ProtocolType
    format: FormatType
    caller: string
    types: { [name: string]: any }
    port?: number
}

class ServerMessage {
    static AddClient = 'ServerMessage.AddClient'
    static ClientAdded = 'ServerMessage.ClientAdded'
    static ValidateClient = 'ServerMessage.ValidateClient'
    static ClientValidated = 'ServerMessage.ClientValidated'
    static ForwardCall = 'ServerMessage.ForwardCall'
}

class RoutingMessage {
    static GetAppInfo = 'RoutingMessage.GetAppInfo'
    static GetSchema = 'RoutingMessage.GetSchema'
    static SetSchema = 'RoutingMessage.SetSchema'
}

class WebSocketInfo {
    web_socket: WebSocket
    connection_signature: Buffer
    is_closed: boolean
    error: Error

    constructor() {
        this.web_socket = null
        this.connection_signature = null
        this.is_closed = false
        this.error = null
    }
}

interface SocketMetadataInfo {
    server_id?: int
    client_id?: int
    lang: string
    ip_address: string
    main_port: int
    main_port_rev: int
    host: string
    entry_file: string
    start_time: string
    client_signature?: string
    client_signature_rev?: string
    server_signature?: string
    server_signature_rev?: string
}

class ClientInfo {
    client_id: int = 0
    client_signature: Buffer = null
    client_signature_rev: Buffer = null
    client_metadata: SocketMetadataInfo = null
    connect_time: Date = null
    is_validated: boolean = false
    is_lost: boolean = false

    constructor(args?: { [key in keyof ClientInfo]?: any }) {
        Object.assign(this, args)
    }
}

interface ApplicationInfo {
    server_id: int
    client_id: int
    is_alive: boolean
    is_ready: boolean
    socket_type: string
    protocol_type: string
    types: number
    services: number
    servers: number
    metadata: SocketMetadataInfo
    this_socket: string
    client_count: number
    clients: {
        client_id: number
        is_validated: boolean
        is_lost: boolean
        entry_file: string
    }[]
    client_ids: number[]
    entry_file: string
    ip_address: string
    port: number
    format: string
}

interface SchemaInfo {
    server_id: number,
    client_id: number,
    types: {
        type_name: string
        size: number
        fields: number
        local: boolean
    }[]
    services: {
        service_name: string
        methods: number
        local: boolean
        has_server: boolean
    }[]
    fields: {
        type_name: string,
        field_name: string
        field_type: string
        id_value: number
        offset: number
        size: number
        local: boolean
    }[]
    methods: {
        service_name: string
        method_name: string
        request_type: string
        response_type: string
        id_value: number
        local: boolean
    }[]
    metadata: SocketMetadataInfo
    active_client: number
    this_socket: string
    clients: {
        main_port: number
        client_id: number
        is_validated: boolean
        is_lost: boolean
        entry_file: string
        client_metadata: SocketMetadataInfo
    }[]
    servers: {
        port: number
        entry_file: string
        server_metadata: SocketMetadataInfo
    }[]
    entry_file: string
}

enum FieldType {
    Unknown = 0,
    Complex = 1,
    Int = 2,
    Float = 3,
    String = 4,
    Json = 5,
}

const TypeNames = [
    'unknown',
    'complex',
    'int',
    'float',
    'str',
    'dict'
]

const DYNAMIC_OBJECT = 'dict'

class FieldInfo {
    field_name: string = ''
    field_type: string = ''
    id_value: int = 0
    offset: int = 0
    size: int = 0
    local: boolean = false
    field_errors: string = ''

    constructor(args?: { [key in keyof FieldInfo]?: any }) {
        Object.assign(this, args)
    }
}

class MethodInfo {
    method_name: string = ''
    request_type: string = ''
    response_type: string = ''
    id_value: int = 0
    local: boolean = false
    method_errors: string = ''

    constructor(args?: { [key in keyof MethodInfo]?: any }) {
        Object.assign(this, args)
    }
}

class ClassInfo {
    type_name: string = ''
    fields: Dictionary<string, FieldInfo> = {}
    size: int = 0
    local: boolean = false
    clazz: Type = null
    type_errors: string = ''

    constructor(args?: { [key in keyof ClassInfo]?: any }) {
        Object.assign(this, args)
    }
}

class ServiceInfo {
    service_name: string = ''
    methods: Dictionary<string, MethodInfo> = {}
    local: boolean = false
    clazz: Type = null
    service_errors: string = ''

    constructor(args?: { [key in keyof ServiceInfo]?: any }) {
        Object.assign(this, args)
    }
}

class ServerInfo {
    server_name: string = ''
    service_name: string = ''
    instance: any = null
    methods: Dictionary<string, MethodInfo> = {}
    server_errors: string = ''

    constructor(args?: { [key in keyof ServerInfo]?: any }) {
        Object.assign(this, args)
    }
}

const g_all_types: Dict<ClassInfo> = {}
const g_all_services: Dict<ServiceInfo> = {}

g_all_types[DYNAMIC_OBJECT] = new ClassInfo({
    type_name: DYNAMIC_OBJECT,
    fields: {},
    size: -1,
    clazz: Object,
    local: true
})

// See also lang/common_base.ts -> ClassDescription
//
interface ClassDescription {
    name: string
    decorators: {
        name: string
        parameters: any
    }[]
    fields: {
        name: string
        type: string
    }[]
    methods: {
        name: string
        returns: string
        parameters: {
            name: string
            type: string
        }[]
    }[]
}

function register_class(clazz, field_options, class_info_) {
    const class_info: ClassDescription = JSON.parse(class_info_)

    if (class_info) {
        assert(clazz.name == class_info.name)
        assert(class_info.decorators.length == 1)
        assert(Object.keys(field_options).length == Object.keys(class_info.decorators[0].parameters).length)
        assert(JSON.stringify(field_options) == JSON.stringify(class_info.decorators[0].parameters))
    }

    if (class_info && class_info.fields && class_info.fields.length) {
        const fields: Dict<FieldInfo> = {}
        for (const item of class_info.fields) {
            fields[item.name] = new FieldInfo({
                field_name: item.name,
                field_type: item.type,
                id_value: field_options[item.name] ?? 0,
            })
        }
        g_all_types[clazz.name] = new ClassInfo({
            type_name: clazz.name,
            fields: fields
        })

        assert(Object.keys(fields).length > 0)
    }

    if (class_info && class_info.methods && class_info.methods.length) {
        const methods: Dict<MethodInfo> = {}
        for (const item of class_info.methods) {
            const req_type = item.parameters[0]
            const res_type = item.returns

            methods[item.name] = new MethodInfo({
                method_name: item.name,
                request_type: req_type['type'],
                response_type: res_type,
                id_value: field_options[item.name] ?? 0,
            })

            assert(req_type['type'])
            assert(res_type)
        }
        g_all_services[clazz.name] = new ServiceInfo({
            service_name: clazz.name,
            methods: methods
        })

        assert(Object.keys(methods).length > 0)
    }
}

function rpcclass(options, class_info = null) {
    return function (clazz) {
        register_class(
            clazz,
            options,
            class_info
        )
        return clazz
    }
}

function construct_item(clazz: any, obj_data: any, args?: any) {
    var info = g_all_types[clazz.name]
    var obj_keys = Object.keys(obj_data)
    for (var [key, field_info] of Object.entries(info.fields)) {
        // TODO: REPEAT12
        if (obj_data[key] !== undefined && args && args[key] === undefined) {
            continue
        }
        // @ts-ignore
        if (field_info.type in g_all_types) {
            // @ts-ignore
            var type_info = g_all_types[field_info.type]
            var temp = new type_info.clazz()
            construct_item(
                type_info.clazz,
                temp,
                args !== undefined ? args[key] : undefined
            )
            obj_data[key] = temp
        } else if (args !== undefined && key in args) {
            obj_data[key] = args[key]
        } else if (!(key in obj_keys)) {
            // @ts-ignore
            var field_type = field_info.type
            if (field_type == 'boolean') {
                obj_data[key] = false
            }
            else if (field_type == 'int') {
                obj_data[key] = 0
            }
            else if (field_type == 'float') {
                obj_data[key] = 0.0
            }
            else if (field_type == 'float') {
                obj_data[key] = 0.0
            }
            else if (field_type == 'number') {
                obj_data[key] = 0
            }
            else if (field_type == 'string') {
                obj_data[key] = ''
            }
            else if (field_type == 'Type') {
                obj_data[key] = null
            }
            else if (field_type.startsWith('Dictionary<')) {
                obj_data[key] = {}
            }
            else if (field_type == 'any[]') {
                obj_data[key] = []
            }
            else if (field_type.endsWith('[]')) {
                obj_data[key] = []
            }
            else {
                assert(false, `Unknown native field type: ${field_type}`)
            }
        }

    }
}

function destroy_item(type_name, item) {
    assert(false);
}

function construct_json(item) {
    const json_data = {}
    assign_values(item.constructor.name, item, json_data, 1)
    return json_data
}

function assign_values(type_name: string, obj_data: any, json_data: any, target: number) {
    assert(type_name)
    
    if (type_name.endsWith('[]')) {
        const type_name_nl = type_name.substring(0, type_name.length - 2)
        const class_info_nl = g_all_types[type_name_nl]
        assert(obj_data instanceof Array)
        assert(json_data instanceof Array)
        if (target == 0) {
            obj_data.length = 0
            for (const item of json_data) {
                const child_data = new class_info_nl.clazz()
                assign_values(type_name_nl, child_data, item, 0)
                obj_data.push(child_data)
            }
        } else {
            json_data.length = 0
            for (const item of obj_data) {
                const child_data = {}
                assign_values(type_name_nl, item, child_data, 1)
                json_data.push(child_data)
            }
        }
        return
    }

    assert(type_name in g_all_types, `Unknown type in assignment: ${type_name}`)
    const class_info = g_all_types[type_name]
    if (class_info.type_name == DYNAMIC_OBJECT) {
        if (target == 0) {
            for (const [key, value] of Object.entries(json_data)) {
                obj_data[key] = value
            }
        } else {
            for (const [key, value] of Object.entries(obj_data)) {
                json_data[key] = value
            }
        }
        return
    }

    const class_info_name = class_info.type_name
    assert(obj_data)
    assert(class_info_name)
    assert(class_info_name in g_all_types, `Unknown type: ${class_info_name}`)

    const fields = g_all_types[class_info_name].fields
    for (const [key, field_info0] of Object.entries(fields)) {
        const field_info = field_info0 as any
        // TODO: REPEAT12
        if (target == 0 && !(key in json_data)) {

        }
        // @ts-ignore
        else if (field_info.type in g_all_types) {
            const native_type_info = g_all_types[field_info.type]
            if (target == 0) {
                if (obj_data[key] === null) {
                    obj_data[key] = new native_type_info.clazz()
                }
                assert(typeof obj_data[key] == 'object')
                assert(typeof json_data[key] == 'object')
                assign_values(field_info.type, obj_data[key], json_data[key], target)
            }
            else {
                json_data[key] = {}
                assert(typeof obj_data[key] == 'object')
                assert(typeof json_data[key] == 'object')
                assign_values(field_info.type, obj_data[key], json_data[key], target)
            }
        }
        else {
            if (target == 0) {
                obj_data[key] = json_data[key]
            }
            else {
                json_data[key] = obj_data[key]
            }
        }
    }
}

function get_class_string(clazz: any, obj_data: any) {
    var info = g_all_types[clazz.name]
    var result = `${clazz.name}(`
    for (const [key, field_info] of Object.entries(info.fields)) {
        if (result.length > 30) {
            result += '...'
            break
        }
        var value = obj_data[key]

        // @ts-ignore
        if (field_info.type in g_all_types) {
            // @ts-ignore
            result += `${get_class_string(g_all_types[field_info.type].clazz, value)}, `
        }
        // @ts-ignore
        else if (field_info.type === 'string') {
            result += `'${value}', `
        }
        else {
            result += `${value}, `
        }
    }
    if (result.endsWith(', ')) {
        result = result.substring(0, result.length - 2)
    }
    result += `)`
    return result
}

function get_simple_type(item) {
    return item.name
}

function init() {
    // Initialize nrpc-ts library
}

class CommandLine implements Dict<any> {
    constructor(fields: Dict<any>) {
        for (const [name, value] of Object.entries(fields)) {
            this[name] = value
        }

        // Note: COMMAND_LINE is defined only when using ServingSocket.
        const cmd_line = process.env.WEBPACK_MODE ? process.env.COMMAND_LINE.split(';') : process.argv
        assert(cmd_line)

        for (const item of cmd_line.slice(1)) {
            if (!item.includes('=') || item.startsWith('-')) {
                continue
            }

            const key = item.substring(0, item.indexOf('='))
            const value = item.substring(item.indexOf('=') + 1)
            let typed: any = value
            const field_type = key in fields ? typeof (fields[key]) : undefined
            if (field_type == 'number' && Number.isInteger(fields[key])) {
                typed = parseInt(value)
            }
            else if (field_type == 'number') {
                typed = parseFloat(value)
            }
            else if (field_type == 'boolean') {
                typed = value == '1' || value == 'true' || value == 'True'
            }
            assert(key in fields, `Unknown command line field: ${key}`)
            this[key] = typed
        }

        for (const item of cmd_line.slice(1)) {
            if (!item.startsWith('--')) {
                continue
            }
            const key = item.substring(2)
            const value = true
            assert(key in fields, `Unknown command line field: ${key}`)
            const field_type = key in fields ? typeof (fields[key]) : undefined
            assert(field_type == 'boolean')
            this[key] = value
        }
    }

    as_string(delim = ' ') {
        const parts = ['ts-node']
        for (const [key, value] of Object.entries(this)) {
            parts.push(`${key}=${value}`)
        }
        return parts.join(delim)
    }
}

class Mutex {
    locked: boolean
    queue: Array<(reason?: any) => void>

    constructor() {
        this.locked = false;
        this.queue = [];
    }

    lock() {
        return new Promise((resolve: (reason?: any) => void) => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    unlock() {
        if (this.queue.length > 0) {
            const nextResolve = this.queue.shift();
            nextResolve();
        } else {
            this.locked = false;
        }
    }

    async runExclusive(callback: () => Promise<void>) {
        await this.lock();
        try {
            await callback();
        } finally {
            this.unlock();
        }
    }
}

class Thread {
    target_: () => Promise<void>
    promise_: Promise<void>

    constructor(target: () => Promise<void>) {
        this.target_ = target
        this.promise_ = null
        assert(this.target_ instanceof Function)
    }
    start() {
        this.promise_ = this.target_()
        this.target_ = null
        assert(this.promise_ instanceof Promise)
    }
    async join() {
        return await this.promise_
    }
    static async join(threads: Array<Thread>) {
        return await Promise.all(threads.map(x => x.promise_))
    }
}

async function sleepAsync(delay_ms: number) {
    await new Promise(resolve => {
        setTimeout(resolve, delay_ms)
    });
}

function base64_encode(bytes: Buffer) {
    assert(bytes)
    const binString = Array.from(bytes, (byte) =>
        String.fromCodePoint(byte),
    ).join("");
    return btoa(binString);
}

function base64_decode(text: string) {
    assert(text)
    const binString = atob(text);
    // return Buffer.from(binString)
    return Buffer.from(Uint8Array.from(binString, (m) => m.codePointAt(0)));
}

function is_dictionary(item) {
    return item?.constructor?.name === 'Object' // !(item instanceof Array) && item instanceof Object
}

function is_dictionary_list(item) {
    return item instanceof Array || item instanceof Object
}

function areSetsEqual<T>(a: Array<T>, b: Array<T>) {
    if (a.length !== b.length) {
        return false;
    }
    for (let item of a) {
        if (!b.includes(item)) {
            return false;
        }
    }
    return true;
}

async function execCommand(command) {
    return new Promise((resolve, reject) => {
        const [cmd, ...args] = command.split(' ');
        const childProcess = child_process.spawn(cmd, args);
        childProcess.stdout.on('data', (data) => {
            process.stdout.write(data.toString());
        });
        childProcess.stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });
        childProcess.on('error', (error) => {
            reject(error);
        });
        childProcess.on('exit', (code) => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(new Error(`Command exited with code ${code}.`));
            }
        });
    });
}

interface ServingSocketOptions {
    type: SocketType
    protocol: ProtocolType
    format: FormatType
    caller: string
    main_page?: string
    static_dir?: string
    types: { [name: string]: any }
    command_line?: CommandLine
}

interface ServingSocketClientInfo {
    client_id: number
    client_count: number
    start_time: string
    connect_time: string
    type: string
    protocol: string
    format: string
    main_page: string
    entry_file: string
    servers: number
    methods: number
    command_line: string
}

export {
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

    type int,
    type float,
    type Dict,
    type ReadOnlyDict,
    type Dictionary,
    type Type,
    LinkedList,
    annotation_name,
    annotation_final_compiler,

    type ServingSocketOptions,
    type ServingSocketClientInfo,
}