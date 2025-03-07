/**
 * Contents:
 *      HelloRequest
 *      TestApplication
 *          start
 */
import assert from 'assert'
import nrpc_ts from '../lib'
import { rpcclass, int, float, Dictionary } from '../lib'


@rpcclass({
    name: 1,
    value: 2,
    newonserver: 4
})
class HelloRequest {
    name: string = ''
    value: int = 0
    newonserver: float = 0.0

    constructor(args?: { [key in keyof HelloRequest]?: any }) {
        Object.assign(this, args)
    }
}

class TestApplication {
    start() {
        console.log('COMPILER', nrpc_ts.annotation_final_compiler)
        console.log('ANNOTATION', nrpc_ts.annotation_name)
        console.log('REQUEST', HelloRequest)
        console.log('TYPES', nrpc_ts.g_all_types)
        console.log('SERVICES', nrpc_ts.g_all_services)

        // @ts-ignore
        assert(nrpc_ts.annotation_final_compiler == 'ts-patch-with-common-transpiler')

        let sock = new nrpc_ts.RoutingSocket({
            type: nrpc_ts.SocketType.BIND,
            protocol: nrpc_ts.ProtocolType.TCP,
            format: nrpc_ts.FormatType.JSON,
            caller: 'test_class_ts',
            port: 9000,
            types: []
        })
        console.log('SOCK', !!sock)

        sock = new nrpc_ts.RoutingSocket({
            type: nrpc_ts.SocketType.CONNECT,
            protocol: nrpc_ts.ProtocolType.TCP,
            format: nrpc_ts.FormatType.JSON,
            caller: 'test_class_ts',
            port: 9000,
            types: []
        })
        console.log('SOCK', !!sock)

        sock = new nrpc_ts.RoutingSocket({
            type: nrpc_ts.SocketType.BIND,
            protocol: nrpc_ts.ProtocolType.WS,
            format: nrpc_ts.FormatType.JSON,
            caller: 'test_class_ts',
            port: 9000,
            types: []
        })
        console.log('SOCK', !!sock)

        sock = new nrpc_ts.RoutingSocket({
            type: nrpc_ts.SocketType.CONNECT,
            protocol: nrpc_ts.ProtocolType.WS,
            format: nrpc_ts.FormatType.JSON,
            caller: 'test_class_ts',
            port: 9000,
            types: []
        })
        console.log('SOCK', !!sock)
    }
}

if (require.main === module) {
    nrpc_ts.init()
    const app = new TestApplication()
    app.start()
}

