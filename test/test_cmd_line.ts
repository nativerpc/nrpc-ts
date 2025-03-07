/**
 * Contents:
 *      TestApplication
 *          start
 */
import nrpc_ts from '../lib'

class TestApplication {
    async start() {
        const cmd = new nrpc_ts.CommandLine({
            'port': 1000,
            'condition': false,
        })
        console.log('PORT', cmd['port'], cmd['condition'])
    }
}

if (require.main === module) {
    nrpc_ts.init()
    new TestApplication().start()
}