import ts, { NewLineKind, ScriptKind, ScriptTarget } from 'typescript'
import { createTypeAlias, zodToTs } from 'zod-to-ts'

import { RpcEndpointInfo, RpcPluginBuilder } from './rpc.js'

const F = ts.factory

export function generateClient(fileName: string, ...rpcBuilders: readonly RpcPluginBuilder[]) {
    const sourceFile = ts.createSourceFile(fileName, '', ScriptTarget.Latest, false, ScriptKind.TS)
    const printer = ts.createPrinter({ newLine: NewLineKind.CarriageReturnLineFeed })
    const p = (node: ts.Node) => {
        return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile)
    }

    const fileContent: string[] = []

    fileContent.push(p(
        F.createImportDeclaration(
            undefined,
            F.createImportClause(
                false,
                undefined,
                F.createNamedImports([
                    F.createImportSpecifier(
                        false,
                        undefined,
                        F.createIdentifier('AuthParam')
                    ),
                    F.createImportSpecifier(
                        false,
                        undefined,
                        F.createIdentifier('rpcCall')
                    )
                ])
            ),
            F.createStringLiteral('rlz-engine/client/rpc.js'),
            undefined
        )

    ))

    for (const b of rpcBuilders) {
        for (const e of b.endpoints) {
            fileContent.push(...generateTypes(b.name, e, p))
        }
    }

    const props = rpcBuilders.map((b) => {
        const calls = b.endpoints.map((e) => {
            return F.createPropertyAssignment(
                F.createIdentifier(e.name),
                F.createArrowFunction(
                    [F.createToken(ts.SyntaxKind.AsyncKeyword)],
                    undefined,
                    e.anonimous
                        ? [
                                F.createParameterDeclaration(
                                    undefined,
                                    undefined,
                                    F.createIdentifier('body'),
                                    undefined,
                                    F.createTypeReferenceNode(
                                        F.createIdentifier(createBodyTypeName(b.name, e)),
                                        undefined
                                    ),
                                    undefined
                                )
                            ]
                        : [
                                F.createParameterDeclaration(
                                    undefined,
                                    undefined,
                                    F.createIdentifier('auth'),
                                    undefined,
                                    F.createTypeReferenceNode(
                                        F.createIdentifier('AuthParam'),
                                        undefined
                                    ),
                                    undefined
                                ),
                                F.createParameterDeclaration(
                                    undefined,
                                    undefined,
                                    F.createIdentifier('body'),
                                    undefined,
                                    F.createTypeReferenceNode(
                                        F.createIdentifier(createBodyTypeName(b.name, e)),
                                        undefined
                                    ),
                                    undefined
                                )
                            ],
                    F.createTypeReferenceNode(
                        F.createIdentifier('Promise'),
                        [F.createTypeReferenceNode(
                            F.createIdentifier(createRespTypeName(b.name, e)),
                            undefined
                        )]
                    ),
                    F.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    F.createBlock(
                        [F.createReturnStatement(F.createAwaitExpression(F.createCallExpression(
                            F.createIdentifier('rpcCall'),
                            undefined,
                            [
                                e.anonimous ? F.createNull() : F.createIdentifier('auth'),
                                F.createStringLiteral(b.name),
                                F.createStringLiteral(e.name),
                                F.createNumericLiteral(e.v),
                                F.createIdentifier('body')
                            ]
                        )))],
                        true
                    )
                )
            )
        })

        return F.createPropertyAssignment(
            F.createIdentifier(b.name),
            F.createObjectLiteralExpression(
                calls,
                false
            )
        )
    })

    const rpcClientNode = F.createVariableStatement(
        [F.createToken(ts.SyntaxKind.ExportKeyword)],
        F.createVariableDeclarationList(
            [F.createVariableDeclaration(
                F.createIdentifier('RPC_CLIENT'),
                undefined,
                undefined,
                F.createObjectLiteralExpression(
                    props,
                    false
                )
            )],
            ts.NodeFlags.Const
        )
    )

    fileContent.push(p(rpcClientNode))

    return fileContent.join('\n')
}

function generateTypes(rpcName: string, e: RpcEndpointInfo, p: (node: ts.Node) => string) {
    const resp: string[] = []

    const bodyTypeName = createBodyTypeName(rpcName, e)
    const bodyType = zodToTs(e.bodySchema, bodyTypeName)
    const bodyTypeAlias = createTypeAlias(bodyType.node, bodyTypeName)

    resp.push(p(bodyTypeAlias))

    const respTypeName = createRespTypeName(rpcName, e)
    const respType = zodToTs(e.respSchema, respTypeName)
    const respTypeAlias = createTypeAlias(respType.node, respTypeName)

    resp.push(p(respTypeAlias))

    return resp
}

function firstLetterUp(text: string) {
    return `${text[0].toUpperCase()}${text.substring(1)}`
}

function createBodyTypeName(rpcName: string, e: RpcEndpointInfo) {
    return `RpcBody${firstLetterUp(rpcName)}${firstLetterUp(e.name)}V${e.v}`
}

function createRespTypeName(rpcName: string, e: RpcEndpointInfo) {
    return `RpcResp${firstLetterUp(rpcName)}${firstLetterUp(e.name)}V${e.v}`
}
