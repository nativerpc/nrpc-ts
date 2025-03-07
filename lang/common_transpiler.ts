/**
 * Contents:
 *      annotation_xxx
 *      ClassDescription
 *      transpile_program
 *      _update_nodes
 *      _update_decorator
 *      _get_class_info
 */ 
import ts from "typescript";
import JSON5 from 'json5'
import assert from 'assert';

// See also: "npx ts-node --compiler ${annotation_compiler} --compilerOptions "${annotation_transpiler}" xxx.ts"
// See also: "npx tsx xxx.ts"
//
const annotation_name = 'rpcclass'
const annotation_final_compiler_name = 'annotation_final_compiler'
const annotation_compiler = 'ts-patch/compiler'
const annotation_transpiler = './lang/common_transpiler.ts'
const annotation_final_compiler = 'default'

// See also lib/common_base.ts -> ClassDescription
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

function transpile_program(program: ts.Program, opts: any) {
    return {
        before: [
            function (context: ts.TransformationContext) {
                return (file: ts.SourceFile) => {
                    return _update_nodes(context, file, file, 0);
                }
            }
        ]
    }
}

function _update_nodes(context: any, file: ts.SourceFile, node: ts.Node, depth: number) {
    // Annotation_final_compiler value
    //
    if (depth <= 3 &&
        ts.isVariableDeclaration(node) &&
        node.name && 
        (node as any).name.text == annotation_final_compiler_name) {
        return ts.factory.createVariableDeclaration(
            (node as any).name.text,
            undefined,
            (node as any).type,
            ts.factory.createStringLiteral('ts-patch-with-common-transpiler')
        )
    }

    // Class_info argument in class annotation call
    //
    if (ts.isClassDeclaration(node)) {
        return ts.visitEachChild(
            node,
            (child) => {
                if (ts.isDecorator(child)) {
                    return _update_decorator(context, file, node, child, depth)
                }
                return child
            },
            context
        );
    }

    return ts.visitEachChild(
        node,
        (child) => {
            return _update_nodes(context, file, child, depth + 1);
        },
        context
    );
}

/**
 * Extra argument adding updater.
 */
function _update_decorator(
    context: any, file: ts.SourceFile, class_node: ts.ClassDeclaration,
    dec_node: ts.Decorator, depth: number) {
    const class_info: ClassDescription = _get_class_info(context, file, class_node as ts.ClassDeclaration, depth)
    const expr_node: ts.CallExpression = dec_node.expression as ts.CallExpression;
    const first_onde = dec_node.expression.getFirstToken(file) as ts.Identifier
    
    if (first_onde.text != annotation_name) {
        return class_node
    }

    assert(class_info)
    assert(first_onde.text == annotation_name)
    assert(ts.isCallExpression(expr_node), `Wrong expression!`)
    assert(expr_node.arguments.length <= 1, `Wrong arg count! ${expr_node.arguments.length}`)
    const empty_arg = ts.factory.createObjectLiteralExpression([])
                
    return ts.factory.updateDecorator(
        dec_node,
        ts.factory.updateCallExpression(
            expr_node,
            expr_node.expression,
            expr_node.typeArguments,
            [
                ...(expr_node.arguments.length > 0 ? expr_node.arguments : [empty_arg]),
                ts.factory.createStringLiteral(JSON.stringify(class_info))
            ]
        )
    );
}

/**
 * Class description getter.
 */
function _get_class_info(context: any, file: ts.SourceFile, node: ts.ClassDeclaration, depth: number) {
    var result: ClassDescription = {
        name: node.name.text,
        decorators: [],
        fields: [],
        methods: [],
    }

    if (ts.getDecorators(node)) {
        for (var item2 of ts.getDecorators(node)) {
            var dec_name = (item2.expression as any).expression.getText(file)
            var dec_args = (item2.expression as any).arguments.length > 0 ?
                (item2.expression as any).arguments[0].getText(file) :
                null
            dec_args = dec_args ? JSON5.parse(dec_args) : null
            result.decorators.push({
                name: dec_name,
                parameters: dec_args
            })
        }
    }

    for (var item of node.members) {
        if (item.kind == ts.SyntaxKind.PropertyDeclaration) {
            var field_type = (item as ts.PropertyDeclaration).type.getText(file)
            result.fields.push({
                name: (item as any).name.text,
                type: field_type
            })
        }
        else if (item.kind == ts.SyntaxKind.MethodDeclaration) {
            if ((item as any).name.text == 'constructor') {
                continue
            }
            var returns = (item as ts.MethodDeclaration).type ? (item as ts.MethodDeclaration).type.getText(file) : 'undefined'
            if (returns.startsWith('Promise<') && returns.endsWith('>')) {
                returns = returns.substring('Promise<'.length, returns.length - 1)
            }
            var parameters = []
            for (var param of (item as ts.MethodDeclaration).parameters) {
                parameters.push({
                    name: param.name.getText(file),
                    type: param.type?.getText(file)
                })
            }
            result.methods.push({
                name: (item as any).name.text,
                returns: returns,
                parameters: parameters,
            })
        }
    }
    return result
}

export default transpile_program

export {
    transpile_program,
    _update_nodes,
}