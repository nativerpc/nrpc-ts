/**
 *  Contents:
 * 
 *      ServingSocket
 *          constructor
 *          _add_types
 *          cast
 *          bind
 *          connect
 *          server_call
 * 
 *          _create_webpack
 *          _update_load
 *          _connect_client
 * 
 *          is_alive
 *          port
 *          main_page
 *          client_id
 *          client_info
 *          clients
 *          close
 */

import assert from 'assert'
import path from 'path'
import fs from 'fs'
import ts from "typescript"
import express from 'express'
import WebpackDevMiddleware from 'webpack-dev-middleware'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack';
import {
    g_all_services,
    SocketType, ProtocolType, FormatType, ServerInfo, Dictionary,
    MethodInfo
} from './common_base'
import * as nrpc_ts from './common_base'
import {_update_nodes} from '../lang/common_transpiler'

class ServingSocket {
    socket_type: SocketType
    protocol_type: ProtocolType
    format_type: FormatType
    socket_name_: string
    main_page_: string
    main_page_html_: string
    main_page_tsx_: string
    ip_address_: string
    port_: number
    is_alive_: boolean
    webpack_: any
    application_: express.Application
    server_: any
    static_dir_: string
    known_servers_: Dictionary<string, ServerInfo>
    command_line_: string
    next_client_id_: number
    clients_: nrpc_ts.ClientInfo[]
    start_time_: Date
    client_info_: nrpc_ts.ServingSocketClientInfo

    constructor(options: nrpc_ts.ServingSocketOptions) {
        this.socket_type = options.type
        this.protocol_type = options.protocol
        this.format_type = options.format
        this.socket_name_ = options.name
        this.main_page_ = ''
        this.main_page_html_ = ''
        this.main_page_tsx_ = ''
        this.ip_address_ = ''
        this.port_ = 0
        this.is_alive_ = true
        this.webpack_ = null
        this.application_ = null
        this.server_ = null
        this.static_dir_ = ''
        this.known_servers_ = {}
        this.command_line_ = options.command_line ? options.command_line.as_string(";") : ''
        this.next_client_id_ = 0
        this.clients_ = []
        this.start_time_ = new Date()
        this.client_info_ = null
        
        if (this.socket_type == SocketType.BIND) {
            if (options.static_dir) {
                this.static_dir_ = path.resolve(options.static_dir)
                assert(fs.existsSync(this.static_dir_))
            }
            this.application_ = express();
            this.application_.use(express.json())
            if (this.static_dir_) {
                this.application_.use(express.static(this.static_dir_))
            }
            this.application_.use(express.static(path.dirname(this.main_page_tsx_)))
            this.main_page_tsx_ = path.resolve(options.main_page)
            this.main_page_ = path.basename(this.main_page_tsx_)
            this.main_page_html_ = this.main_page_tsx_.replaceAll('.tsx', '.html').replaceAll('.ts', '.html')
            assert(fs.existsSync(this.main_page_tsx_))

            this.application_.post(`/servingsocket/connect`, (req, res) => this._connect_client(req, res))

            this._add_types(options.types)
        }
        else {
            this._add_types(options.types)
        }

        assert(this.protocol_type == ProtocolType.HTTP)
        assert(this.format_type == FormatType.JSON)
    }

    /**
     * Create POST end-points for each service method.
     */
    _add_types(types: {[name: string]: any}) {
        for (var [name, item] of Object.entries(types)) {
            if (name in this.known_servers_) {
                continue
            }
            const clazz = item instanceof Array ? item[0] : item
            const server_instance = item instanceof Array ? item[1] : null
            if (!server_instance) {
                continue
            }
            const service_info = g_all_services[name]

            assert(clazz.name == name, `Class name mismatch: ${clazz.name}, ${name}`)
            assert(name in g_all_services, `Unknown type: ${name}`)
            assert(server_instance)

            this.known_servers_[name] = new ServerInfo({
                server_name: name,
                service_name: name,
                instance: server_instance,
                methods: {},
                server_errors: '',
            })

            for (const [method_name, method_info] of Object.entries(service_info.methods)) {
                const id_value = method_info.id_value
                const method2 = server_instance.__proto__[method_name]
                assert(server_instance.__proto__)
                
                this.known_servers_[name].methods[method_name] = new MethodInfo({
                    method_name: method_name,
                    request_type: method_info.request_type,
                    response_type: method_info.request_type,
                    id_value: id_value,
                    local: true,
                })

                if (process.env.WEBPACK_MODE) {

                } else {
                    const url_name = `/${name}/${method_name}`.toLowerCase()
                    this.application_.post(url_name, async (req, res) => {
                        assert(req.is('json'))
                        req.accepts('json');
                        const resp = await method2.apply(server_instance, [req.body])
                        res.json(resp)
                    })
                }
            }
        }
    }

    cast<T>(clazz: new (...args: any[]) => T): T {
        assert(this.socket_type == SocketType.CONNECT)
        const service_name = clazz.name
        const methods = g_all_services[service_name].methods
        const result = {}
        const self = this

        for (var method_name in methods) {
            const url_name = `${service_name}/${method_name}`.toLowerCase()
            result[method_name] = async function (req: any): Promise<any> {
                return await self.server_call(url_name, req)
            }
        }

        return result as T
    }

    async bind(ip_address, port) {
        assert(this.socket_type == SocketType.BIND)
        this.ip_address_ = ip_address
        this.port_ = port
        assert(this.main_page_html_)
        assert(fs.existsSync(this.main_page_html_))
        assert(this.socket_type == SocketType.BIND)
        this._create_webpack()
        this.application_.use(
            WebpackDevMiddleware(this.webpack_, {
                // noInfo: true
            })
        );
        this.server_ = this.application_.listen(this.port_, () => {
            // console.log(`Http server started, ${this.port_}`)
        })
    }

    async connect(ip_address, port) {
        assert(this.socket_type == SocketType.CONNECT)
        this.ip_address_ = ip_address
        this.port_ = port
        this.client_info_ = await this.server_call('servingsocket/connect', {})
    }

    async server_call(name: string, request: any): Promise<any> {
        assert(name.includes('/'))
        const headers: Headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Accept', 'application/json')
        const req3: Request = new Request(`/${name}`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(request)
        })
        const resp1 = await fetch(req3)
        const resp: any = await resp1.json();
        return resp
    }

    _create_webpack() {
        // @ts-ignore
        this.webpack_ = webpack.webpack({
            mode: 'development',
            entry: {
                'main': this.main_page_tsx_
            },
            module: {
                rules: [
                    {
                        test: /\.(ts|tsx)$/,
                        loader: 'ts-loader',
                        exclude: [
                            /staging_modules/,
                            /node_modules/,
                            /bin/,
                            /build/,
                        ],
                        options: {
                            compilerOptions: {
                                "noEmit": false,
                                "lib": [
                                    "dom",
                                    "dom.iterable",
                                    "esnext"
                                ],
                            },
                            getCustomTransformers: program => ({
                                before: [
                                    function (context: ts.TransformationContext) {
                                        return (file: ts.SourceFile) => {
                                            return _update_nodes(context, file, file, 0);
                                        }
                                    }
                                ],
                            })
                        }
                    },
                    {
                        test: /\.css$/, // Use for CSS files
                        use: [
                            'style-loader',
                            'css-loader'
                        ],
                    },
                ],
            },
            resolve: {
                extensions: ['.tsx', '.ts', '.js', '.jsx'],
                fallback: {
                    'util': require.resolve('util/'),
                },
                alias: {
                    'zeromq': false,
                    'webpack': false,
                    'webpack-dev-middleware': false,
                    'html-webpack-plugin': false,
                    'path': false,
                    'fs': false,
                    'express': false,
                    'common_transpiler': false,
                }
            },

            output: {
                publicPath: '/',
                filename: '[name].bundle.js',
                chunkFilename: '[id].bundle_[chunkhash].js',
                sourceMapFilename: '[file].map'
            },

            plugins: [
                // Html pages
                new HtmlWebpackPlugin({
                    title: 'Test Application',
                    template: this.main_page_html_,
                    chunks: ['main'],
                }),
                new webpack.ProvidePlugin({
                    // Global `process` variable
                    process: 'process/browser',
                }),
                new webpack.DefinePlugin({
                    'process.env.WEBPACK_MODE': this.port_,
                    'process.env.COMMAND_LINE': `'${this.command_line_}'`,
                    'process.env.MAIN_PAGE': `'${this.main_page_}'`,
                    'process.env.PORT': this.port_,
                }),
                new webpack.ProvidePlugin({
                    Buffer: ['buffer', 'Buffer'],
                }),
                new webpack.ProgressPlugin((percentage, message, ...args) => this._update_load(percentage, message, ...args))
            ],

            stats: 'errors-only',
            infrastructureLogging: {
                level: 'error',
            },

            devServer: {
                // See also noEmit=false
                stats: 'errors-only',
                compress: true,
                port: this.port_,
            }
        });
    }

    _update_load(percentage, message, ...args) {
        var total = Math.round(percentage * 100)
        // console.log(`Loading ${total}`) // , ${message}, ${args}`)
        if (total == 100 && message == '') {
            // console.log(`Started http server ${this.port_}`)
        }
    }

    /** 
     * '/servingsocket/connect' endpoint
     */
    async _connect_client(req: any, res: any) {
        assert(req.is('json'))
        req.accepts('json');
        this.next_client_id_ += 1
        const client = new nrpc_ts.ClientInfo({
            client_id: this.next_client_id_,
            connect_time: new Date(),
            is_lost: false,
            is_validated: true,
            client_metadata: {}
        })
        this.clients_.push(client)
        let method_count = 0
        for (const item of Object.values(this.known_servers_)) {
            method_count += Object.keys(item.methods).length
        }
        const resp: nrpc_ts.ServingSocketClientInfo = {
            client_id: client.client_id,
            client_count: this.clients_.length,
            start_time: this.start_time_.toISOString(),
            connect_time: client.connect_time.toISOString(),
            type: this.socket_type.toString(),
            protocol: this.protocol_type.toString(),
            format: this.format_type.toString(),
            main_page: this.main_page_,
            socket_name: this.socket_name_,
            servers: Object.keys(this.known_servers_).length,
            methods: method_count,
            command_line: this.command_line_,
        }
        res.json(resp)
    }

    get is_alive(): boolean {
        return this.is_alive_
    }

    get port(): number {
        return this.port_
    }

    get main_page(): string {
        return this.main_page_
    }

    get client_id(): number {
        return this.client_info_ ? this.client_info_.client_id : 0
    }

    get client_info(): nrpc_ts.ServingSocketClientInfo {
        return this.client_info_
    }

    get clients(): nrpc_ts.ClientInfo[] {
        return this.clients_
    }

    close() {
        this.is_alive_ = false
        this.server_.closeAllConnections()
        this.server_.close()
        this.server_ = null
        this.webpack_ = null
        this.application_ = null
    }
}

export {
    ServingSocket
}
