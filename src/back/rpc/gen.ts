import ts, { NewLineKind, ScriptKind, ScriptTarget } from 'typescript'
import { createAuxiliaryTypeStore, zodToTs } from 'zod-to-ts'

import { AdmRpcEndpointInfo, AdmRpcPluginBuilder, RpcEndpointInfo, RpcPluginBuilder } from './rpc.js'

const F = ts.factory

export function generateClient(fileName: string, ...rpcBuilders: readonly RpcPluginBuilder[]) {
    return generateTypedClient(fileName, rpcBuilders, {
        callFunction: 'rpcCall',
        clientName: 'RPC_CLIENT',
        importNames: ['rpcCall'],
        endpointInfo: (builder) => builder.endpoints,
        authParams: () => []
    })
}

export function generateAdmClient(fileName: string, ...rpcBuilders: readonly AdmRpcPluginBuilder[]) {
    return generateTypedClient(fileName, rpcBuilders, {
        callFunction: 'admRpcCall',
        clientName: 'ADM_RPC_CLIENT',
        importNames: ['AdmAuthParam', 'admRpcCall'],
        endpointInfo: (builder) => builder.endpoints,
        authParams: () => [{ name: 'auth', type: 'AdmAuthParam' }],
        authArgument: () => F.createIdentifier('auth')
    })
}

interface ClientGeneratorOptions<BuilderT extends { name: string }> {
    callFunction: string
    clientName: string
    importNames: readonly string[]
    endpointInfo: (builder: BuilderT) => readonly (RpcEndpointInfo | AdmRpcEndpointInfo)[]
    authParams: (endpoint: RpcEndpointInfo | AdmRpcEndpointInfo) => { name: string; type: string }[]
    authArgument?: (endpoint: RpcEndpointInfo | AdmRpcEndpointInfo) => ts.Expression
}

function generateTypedClient<BuilderT extends { name: string }>(
    fileName: string,
    rpcBuilders: readonly BuilderT[],
    options: ClientGeneratorOptions<BuilderT>
) {
    const sourceFile = ts.createSourceFile(fileName, '', ScriptTarget.Latest, false, ScriptKind.TS)
    const printer = ts.createPrinter({ newLine: NewLineKind.CarriageReturnLineFeed })
    const p = (node: ts.Node) => {
        return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile)
    }

    const fileContent: string[] = []

    fileContent.push(
        p(
            F.createImportDeclaration(
                undefined,
                F.createImportClause(
                    undefined,
                    undefined,
                    F.createNamedImports(
                        options.importNames.map((name) => F.createImportSpecifier(false, undefined, F.createIdentifier(name)))
                    )
                ),
                F.createStringLiteral('rlz-engine/client/rpc.js'),
                undefined
            )
        )
    )

    for (const b of rpcBuilders) {
        for (const e of options.endpointInfo(b)) {
            fileContent.push(...generateTypes(b.name, e, p))
        }
    }

    const props = rpcBuilders.map((b) => {
        const calls = options.endpointInfo(b).map((e) => {
            const parameters = [
                ...options
                    .authParams(e)
                    .map(({ name, type }) =>
                        F.createParameterDeclaration(
                            undefined,
                            undefined,
                            F.createIdentifier(name),
                            undefined,
                            F.createTypeReferenceNode(F.createIdentifier(type), undefined),
                            undefined
                        )
                    ),
                F.createParameterDeclaration(
                    undefined,
                    undefined,
                    F.createIdentifier('body'),
                    undefined,
                    F.createTypeReferenceNode(F.createIdentifier(createBodyTypeName(b.name, e)), undefined),
                    undefined
                )
            ]
            return F.createPropertyAssignment(
                F.createIdentifier(kebabToPascalCase(e.name)),
                F.createArrowFunction(
                    [F.createToken(ts.SyntaxKind.AsyncKeyword)],
                    undefined,
                    parameters,
                    F.createTypeReferenceNode(F.createIdentifier('Promise'), [
                        F.createTypeReferenceNode(F.createIdentifier(createRespTypeName(b.name, e)), undefined)
                    ]),
                    F.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    F.createBlock(
                        [
                            F.createReturnStatement(
                                F.createAwaitExpression(
                                    F.createCallExpression(F.createIdentifier(options.callFunction), undefined, [
                                        ...(options.authArgument === undefined ? [] : [options.authArgument(e)]),
                                        F.createStringLiteral(b.name),
                                        F.createStringLiteral(e.name),
                                        F.createNumericLiteral(e.v),
                                        F.createIdentifier('body')
                                    ])
                                )
                            )
                        ],
                        true
                    )
                )
            )
        })

        return F.createPropertyAssignment(F.createIdentifier(kebabToPascalCase(b.name)), F.createObjectLiteralExpression(calls, false))
    })

    const rpcClientNode = F.createVariableStatement(
        [F.createToken(ts.SyntaxKind.ExportKeyword)],
        F.createVariableDeclarationList(
            [
                F.createVariableDeclaration(
                    F.createIdentifier(options.clientName),
                    undefined,
                    undefined,
                    F.createObjectLiteralExpression(props, false)
                )
            ],
            ts.NodeFlags.Const
        )
    )

    fileContent.push(p(rpcClientNode))

    return fileContent.join('\n')
}

function generateTypes(rpcName: string, e: RpcEndpointInfo | AdmRpcEndpointInfo, p: (node: ts.Node) => string) {
    const typeStore = createAuxiliaryTypeStore()
    const resp: string[] = []

    const bodyTypeName = createBodyTypeName(rpcName, e)
    const bodyType = zodToTs(e.bodySchema, { auxiliaryTypeStore: typeStore })

    const bodyTypeAlias = F.createTypeAliasDeclaration(
        [F.createToken(ts.SyntaxKind.ExportKeyword)],
        F.createIdentifier(bodyTypeName),
        undefined,
        bodyType.node
    )

    resp.push(p(bodyTypeAlias))

    const respTypeName = createRespTypeName(rpcName, e)
    const respType = zodToTs(e.respSchema, { auxiliaryTypeStore: typeStore })
    const respTypeAlias = F.createTypeAliasDeclaration(
        [F.createToken(ts.SyntaxKind.ExportKeyword)],
        F.createIdentifier(respTypeName),
        undefined,
        respType.node
    )

    resp.push(p(respTypeAlias))

    return resp
}

function kebabToPascalCase(input: string, firstLetterUp: boolean = false): string {
    if (firstLetterUp) {
        return input.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())
    }

    return input.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

function createBodyTypeName(rpcName: string, e: RpcEndpointInfo | AdmRpcEndpointInfo) {
    return `RpcBody${kebabToPascalCase(rpcName, true)}${kebabToPascalCase(e.name, true)}V${e.v}`
}

function createRespTypeName(rpcName: string, e: RpcEndpointInfo | AdmRpcEndpointInfo) {
    return `RpcResp${kebabToPascalCase(rpcName, true)}${kebabToPascalCase(e.name, true)}V${e.v}`
}
