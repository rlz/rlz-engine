import ts, { NewLineKind, ScriptKind, ScriptTarget } from 'typescript'
import { createAuxiliaryTypeStore, zodToTs } from 'zod-to-ts'

import { ADM_AUTH_RPC, AdmRpcEndpointInfo, AdmRpc, RpcEndpointInfo, Rpc } from './rpc.js'

const F = ts.factory

export function generateClient(fileName: string, ...rpcBuilders: readonly Rpc[]) {
    return generateTypedClient(fileName, rpcBuilders, {
        callFunction: 'rpcCall',
        clientName: 'RPC_CLIENT',
        importNames: ['rpcCall'],
        rpcImportPath: 'rlz-engine/client/rpc.js',
        endpointInfo: (builder) => builder.endpoints,
        authParams: () => []
    })
}

export function generateAdmClient(fileName: string, ...rpcBuilders: readonly AdmRpc[]) {
    const builders = [ADM_AUTH_RPC, ...rpcBuilders]
    assertUniquePluginNames(builders)
    return generateAdmClientSource(fileName, builders, 'ADM_RPC_CLIENT', 'rlz-engine/client/rpc.js')
}

export function generateAdmAuthClient(fileName: string) {
    return generateAdmClientSource(fileName, [ADM_AUTH_RPC], 'ADM_AUTH_RPC_CLIENT', '../rpc.js')
}

function generateAdmClientSource(fileName: string, builders: readonly AdmRpc[], clientName: string, rpcImportPath: string) {
    return generateTypedClient(fileName, builders, {
        callFunction: 'admRpcCall',
        clientName,
        importNames: ['AdmAuthParam', 'admRpcCall'],
        rpcImportPath,
        endpointInfo: (builder) => builder.endpoints,
        authParams: () => [{ name: 'auth', type: 'AdmAuthParam' }],
        authArgument: () => F.createIdentifier('auth')
    })
}

function assertUniquePluginNames(builders: readonly { name: string }[]): void {
    const seen = new Set<string>()
    for (const { name } of builders) {
        if (seen.has(name)) throw new Error(`administrative RPC group already composed: ${name}`)
        seen.add(name)
    }
}

interface ClientGeneratorOptions<BuilderT extends { name: string }> {
    callFunction: string
    clientName: string
    importNames: readonly string[]
    rpcImportPath: string
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
                F.createStringLiteral(options.rpcImportPath),
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
