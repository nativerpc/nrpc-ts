/**
 * Contents:
 *      TestApplication
 *          start
 */
import {Context, Router} from 'zeromq'
import nrpc_ts from '../lib'

class TestApplication {
    start() {
        console.log('START class=Context')
        const context = new Context()
        console.log('START class=Router')
        const socket = new Router()
        socket.bind('tcp://127.0.0.1:9000')
        console.log('BIND ok')
        const state = socket.getPeerState(Buffer.from('server:0'))
        console.log(`PEER state=${state}`)
        socket.close()
        console.log('CLOSE ok=1')
    }
}

if (require.main === module) {
    nrpc_ts.init()
    new TestApplication().start()
}