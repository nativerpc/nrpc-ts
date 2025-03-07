/**
 * Contents:
 *      test_compiler.ts
 *          annotation_xxx
 *          g_all_xxx
 *          ClassDescription
 *          myclass
 *          register_class
 *          TestClass
 *          TestApplication
 *              start
 *              compile_and_start
 *              print_summary
 * 
 *      test_transpiler.ts
 *          annotation_xxx
 *          ClassDescription
 *          transpile_program
 *          _update_nodes
 *          _update_decorator
 *          _get_class_info
 */
import { type Dict, type int, type float } from '../lib/common_base'
import assert from 'assert'
import child_process from 'node:child_process'
import util from 'node:util'
import nrpc_ts from '../lib'

const annotation_name = 'myclass'
const annotation_final_compiler_name = 'annotation_final_compiler'
const annotation_compiler = 'ts-patch/compiler'
const annotation_transpiler = 'test_transpiler.ts'
const annotation_final_compiler = 'default'

const all_types: nrpc_ts.ClassInfo[] = []
const all_services: nrpc_ts.ServiceInfo[] = []

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

    if (class_info && class_info.fields) {
        const fields: Dict<nrpc_ts.FieldInfo> = {}
        for (const item of class_info.fields) {
            fields[item.name] = new nrpc_ts.FieldInfo({
                field_name: item.name,
                field_type: item.type,
                id_value: field_options[item.name] ?? 0,
            })
        }
        all_types.push(new nrpc_ts.ClassInfo({
            type_name: clazz.name,
            fields: fields
        }))
    }

    if (class_info && class_info.methods) {
        const methods: Dict<nrpc_ts.MethodInfo> = {}
        for (const item of class_info.methods) {
            const req_type = item.parameters[0]
            const res_type = item.returns

            methods[item.name] = new nrpc_ts.MethodInfo({
                method_name: item.name,
                request_type: req_type['type'],
                response_type: res_type,
                id_value: field_options[item.name] ?? 0,
            })
        }
        all_services.push(new nrpc_ts.ServiceInfo({
            service_name: clazz.name,
            methods: methods
        }))
    }
}

@myclass({ name: 200, someFunction: 300 })
class TestClass {
    name: string = ''
    value: int = 100
    newonserver: float = 1.2

    constructor(options?: { [key in keyof TestClass]?: any }) {
        Object.assign(this, options)
    }

    someFunction(x: int): int {
        return x + 1
    }

    complexFunction(x: string): TestClass[] {
        return []
    }
}

class TestApplication {
    async start() {
        const cmd = new nrpc_ts.CommandLine({
            'compile_and_start': false,
            'print_summary': false,
        })

        if (cmd['compile_and_start']) {
            await this.compile_and_start();
        }
        else if (cmd['print_summary']) {
            await this.print_summary();
        }
        else {
            this.compile_and_start();
        }
    }

    async compile_and_start() {
        console.log(
            `START method=compile_and_start compiler=${annotation_final_compiler} types=${all_types.length} services=${all_services.length}`
        )
        for (const item of all_types) {
            console.log(`TYPE ${item.type_name}`)
        }
        for (const item of all_services) {
            console.log(`SERVICE ${item.service_name}`)
        }
        for (const item of all_types) {
            for (const item2 of Object.values(item.fields)) {
                console.log(`FIELD name=${item2.field_name} type=${item2.field_type}`)
            }
        }
        for (const item of all_services) {
            for (const item2 of Object.values(item.methods)) {
                console.log(`METHOD name=${item2.method_name} returns=${item2.request_type}`)
            }
        }
        const exec = util.promisify(child_process.exec);
        const this_file = __filename
        let this_dir = __dirname.replaceAll('\\', '/')
        console.log(`EXEC compiler=${annotation_compiler} transform=${annotation_transpiler}`)
        const options = {
            plugins: [{
                transform: `${this_dir}/${annotation_transpiler}`
            }]
        }
        const opts = JSON.stringify(options).replaceAll('"', '\\"')
        const res = await exec(
            `npx ts-node --compiler ${annotation_compiler} --compilerOptions "${opts}" ` +
            `${this_file} --print_summary`
        )
        assert(!res.stderr)
        for (const item of res.stdout.trimEnd().split('\n')) {
            console.log(`STDOUT ${item}`)
        }
        console.log('SUCCESS')
    }

    async print_summary() {
        console.log(
            `START method=print_summary compiler=${annotation_final_compiler} types=${all_types.length} services=${all_services.length}`
        )
        for (const item of all_types) {
            console.log(`TYPE ${item.type_name}`)
        }
        for (const item of all_services) {
            console.log(`SERVICE ${item.service_name}`)
        }
        for (const item of all_types) {
            for (const item2 of Object.values(item.fields)) {
                console.log(`FIELD name=${item2.field_name} type=${item2.field_type} id=${item2.id_value}`)
            }
        }
        for (const item of all_services) {
            for (const item2 of Object.values(item.methods)) {
                console.log(`METHOD name=${item2.method_name} takes=${item2.request_type} returns=${item2.response_type} id=${item2.id_value}`)
            }
        }
        const val = new TestClass({ name: 'hello' })
        const val2 = new TestClass()
        console.log(`VALUE ${JSON.stringify(val)}`)
        console.log(`VALUE ${JSON.stringify(val2)}`)
        console.log('SUCCESS')
    }
}

function myclass(options, class_info = null) {
    return function (clazz) {
        register_class(
            clazz,
            options,
            class_info
        )
        return clazz
    }
}

if (require.main === module) {
    nrpc_ts.init()
    new TestApplication().start()
}