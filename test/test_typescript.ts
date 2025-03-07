/**
 * Contents:
 *      TestApplication
 *          start
 */
import assert from 'assert'
import nrpc_ts from '../lib'

// Also defined in node_modules\@types\node\globals.d.ts when executing on browser.
interface Dict<T> {
    [key: string]: T | undefined;
}

class TestApplication {
    start() {
        const x: Dict<string> = {}
        x['test'] = '123'
        process.env['my_test'] = '234'
        assert('test' in x)
        assert('my_test' in process.env)
        console.log(`TEST ok, ${JSON.stringify(x)}`)
    }
}

if (require.main === module) {
    nrpc_ts.init()
    new TestApplication().start()
}

