import ts, { NewLineKind, ScriptKind, ScriptTarget } from 'typescript'
import { createAuxiliaryTypeStore, type OptionalTypeOverrideFunction, zodToTs } from 'zod-to-ts'
import type * as zodCore from 'zod/v4/core'

import { ADM_AUTH_RPC, AdmRpcEndpointInfo, AdmRpc, RpcEndpointInfo, Rpc } from './rpc.js'

const F = ts.factory

const formatTypes = { date: 'DateTime', datetime: 'DateTime', duration: 'Duration' } as const

type WireFormat = 'date' | 'datetime' | 'duration'

interface WireFormatPath {
    path: readonly (string | number)[]
    format: WireFormat
    precision?: number | null
}

interface SchemaDef {
    type?: string
    format?: string
    precision?: number | null
    shape?: Record<string, unknown>
    innerType?: unknown
    element?: unknown
    items?: readonly unknown[]
    rest?: unknown
    valueType?: unknown
    left?: unknown
    right?: unknown
    options?: readonly unknown[]
}

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
    const builders = rpcBuilders.includes(ADM_AUTH_RPC) ? rpcBuilders : [ADM_AUTH_RPC, ...rpcBuilders]
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
    const typeImports = new Set<string>()
    const runtimeImports = new Set(options.importNames)

    for (const builder of rpcBuilders) {
        for (const endpoint of options.endpointInfo(builder)) {
            for (const { format } of collectWireFormats(endpoint.bodySchema)) runtimeImports.add(wireHelperName(format, 'encode'))
            for (const { format } of collectWireFormats(endpoint.respSchema)) runtimeImports.add(wireHelperName(format, 'decode'))
        }
    }

    fileContent.push(
        p(
            F.createImportDeclaration(
                undefined,
                F.createImportClause(
                    undefined,
                    undefined,
                    F.createNamedImports(
                        [...runtimeImports].map((name) => F.createImportSpecifier(false, undefined, F.createIdentifier(name)))
                    )
                ),
                F.createStringLiteral(options.rpcImportPath),
                undefined
            )
        )
    )

    for (const b of rpcBuilders) {
        for (const e of options.endpointInfo(b)) {
            fileContent.push(...generateTypes(b.name, e, p, typeImports))
        }
    }

    if (typeImports.size > 0) {
        fileContent.push(
            p(
                F.createImportDeclaration(
                    undefined,
                    F.createImportClause(
                        false,
                        undefined,
                        F.createNamedImports(
                            [...typeImports].map((name) => F.createImportSpecifier(true, undefined, F.createIdentifier(name)))
                        )
                    ),
                    F.createStringLiteral('luxon'),
                    undefined
                )
            )
        )
    }

    const props = rpcBuilders.map((b) => {
        const calls = options.endpointInfo(b).map((e) => {
            const bodyFormats = collectWireFormats(e.bodySchema)
            const responseFormats = collectWireFormats(e.respSchema)
            const bodyTypeName = createBodyTypeName(b.name, e)
            const respTypeName = createRespTypeName(b.name, e)
            const wireBodyTypeName = bodyFormats.length === 0 ? bodyTypeName : createWireBodyTypeName(b.name, e)
            const wireRespTypeName = responseFormats.length === 0 ? respTypeName : createWireResponseTypeName(b.name, e)
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
            const wireBody = createWireTransformExpression(
                bodyFormats,
                'encode',
                'body',
                undefined,
                bodyFormats.length === 0 ? undefined : wireBodyTypeName
            )
            const rpcResponse = F.createAwaitExpression(
                F.createCallExpression(
                    F.createIdentifier(options.callFunction),
                    [
                        F.createTypeReferenceNode(F.createIdentifier(wireBodyTypeName), undefined),
                        F.createTypeReferenceNode(F.createIdentifier(wireRespTypeName), undefined)
                    ],
                    [
                        ...(options.authArgument === undefined ? [] : [options.authArgument(e)]),
                        F.createStringLiteral(b.name),
                        F.createStringLiteral(e.name),
                        F.createNumericLiteral(e.v),
                        wireBody
                    ]
                )
            )
            const response = F.createIdentifier('response')
            const decodedResponse =
                responseFormats.length === 0
                    ? response
                    : createWireTransformExpression(responseFormats, 'decode', 'response', wireRespTypeName, respTypeName)
            const statements = [
                F.createVariableStatement(
                    undefined,
                    F.createVariableDeclarationList(
                        [F.createVariableDeclaration(response, undefined, undefined, rpcResponse)],
                        ts.NodeFlags.Const
                    )
                ),
                F.createReturnStatement(decodedResponse)
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
                    F.createBlock(statements, true)
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

function generateTypes(rpcName: string, e: RpcEndpointInfo | AdmRpcEndpointInfo, p: (node: ts.Node) => string, typeImports: Set<string>) {
    const typeStore = createAuxiliaryTypeStore()
    const resp: string[] = []
    const overrideFunction: OptionalTypeOverrideFunction = (schema, typescript) => {
        const def = schema._zod.def
        if (def.type !== 'string' || !('format' in def)) return undefined
        if (def.format === 'time') return undefined
        const typeName = formatTypes[def.format as keyof typeof formatTypes]
        if (typeName === undefined) return undefined
        typeImports.add(typeName)
        return typescript.factory.createTypeReferenceNode(
            typeName,
            typeName === 'DateTime' ? [typescript.factory.createLiteralTypeNode(typescript.factory.createTrue())] : undefined
        )
    }

    const bodyTypeName = createBodyTypeName(rpcName, e)
    const bodyType = zodToTs(e.bodySchema, { auxiliaryTypeStore: typeStore, overrideFunction })

    const bodyTypeAlias = F.createTypeAliasDeclaration(
        [F.createToken(ts.SyntaxKind.ExportKeyword)],
        F.createIdentifier(bodyTypeName),
        undefined,
        bodyType.node
    )

    resp.push(p(bodyTypeAlias))

    if (collectWireFormats(e.bodySchema).length > 0) {
        const wireBodyType = zodToTs(e.bodySchema, { auxiliaryTypeStore: createAuxiliaryTypeStore() })
        const wireBodyTypeAlias = F.createTypeAliasDeclaration(
            undefined,
            F.createIdentifier(createWireBodyTypeName(rpcName, e)),
            undefined,
            wireBodyType.node
        )
        resp.push(p(wireBodyTypeAlias))
    }

    const respTypeName = createRespTypeName(rpcName, e)
    const respType = zodToTs(e.respSchema, { auxiliaryTypeStore: typeStore, overrideFunction })
    const respTypeAlias = F.createTypeAliasDeclaration(
        [F.createToken(ts.SyntaxKind.ExportKeyword)],
        F.createIdentifier(respTypeName),
        undefined,
        respType.node
    )

    resp.push(p(respTypeAlias))

    if (collectWireFormats(e.respSchema).length > 0) {
        const wireRespType = zodToTs(e.respSchema, { auxiliaryTypeStore: typeStore })
        const wireRespTypeAlias = F.createTypeAliasDeclaration(
            undefined,
            F.createIdentifier(createWireResponseTypeName(rpcName, e)),
            undefined,
            wireRespType.node
        )
        resp.push(p(wireRespTypeAlias))
    }

    return resp
}

interface WireTransformNode {
    format?: WireFormat
    precision?: number | null
    children: Map<string | number, WireTransformNode>
}

function createWireTransformExpression(
    formats: readonly WireFormatPath[],
    direction: 'encode' | 'decode',
    value: string,
    sourceTypeName?: string,
    resultTypeName?: string
): ts.Expression {
    if (formats.length === 0) return F.createIdentifier(value)
    const tree: WireTransformNode = { children: new Map() }
    for (const format of formats) {
        let node = tree
        for (const segment of format.path) {
            let child = node.children.get(segment)
            if (child === undefined) {
                child = { children: new Map() }
                node.children.set(segment, child)
            }
            node = child
        }
        node.format = format.format
        node.precision = format.precision
    }

    const source = sourceTypeName === undefined ? value : `(${value} as ${sourceTypeName})`
    const expression = renderWireTransform(source, tree, direction)
    return parseExpression(resultTypeName === undefined ? expression : `(${expression}) as ${resultTypeName}`)
}

function renderWireTransform(value: string, node: WireTransformNode, direction: 'encode' | 'decode'): string {
    if (node.format !== undefined) {
        const helper = wireHelperName(node.format, direction)
        const precision = node.format === 'datetime' && direction === 'encode' ? `, ${node.precision ?? 'null'}` : ''
        return nullishTransform(value, `${helper}(${value}${precision})`)
    }

    const arrayChild = node.children.get(-1)
    const tupleChildren = [...node.children.entries()].filter(([key]) => typeof key === 'number' && key >= 0)
    if (arrayChild !== undefined && tupleChildren.length === 0) {
        return nullishTransform(value, `${value}.map((item) => ${renderWireTransform('item', arrayChild, direction)})`)
    }
    if (tupleChildren.length > 0) {
        const branches = tupleChildren.map(([index, child]) => `index === ${index} ? ${renderWireTransform('item', child, direction)} : `)
        const rest = arrayChild === undefined ? 'item' : renderWireTransform('item', arrayChild, direction)
        return nullishTransform(value, `${value}.map((item, index) => ${branches.join('')}${rest})`)
    }
    const recordChild = node.children.get('@record')
    if (recordChild !== undefined) {
        return nullishTransform(
            value,
            `Object.fromEntries(Object.entries(${value}).map(([key, item]) => [key, ${renderWireTransform('item', recordChild, direction)}]))`
        )
    }

    const assignments = [...node.children.entries()].map(([key, child]) => {
        const property = typeof key === 'string' ? JSON.stringify(key) : key
        const access = typeof key === 'string' ? `${value}[${JSON.stringify(key)}]` : `${value}[${key}]`
        return `${property}: ${renderWireTransform(access, child, direction)}`
    })
    return nullishTransform(value, `({ ...${value}, ${assignments.join(', ')} })`)
}

function nullishTransform(value: string, transformed: string): string {
    return `${value} === null || ${value} === undefined ? ${value} : ${transformed}`
}

function parseExpression(expression: string): ts.Expression {
    const source = ts.createSourceFile('generated.ts', `const value = ${expression}`, ScriptTarget.Latest, true, ScriptKind.TS)
    const statement = source.statements[0] as ts.VariableStatement
    const result = statement.declarationList.declarations[0]!.initializer!
    const synthesize = (node: ts.Node) => {
        ts.setTextRange(node, { pos: -1, end: -1 })
        ts.forEachChild(node, synthesize)
    }
    synthesize(result)
    return result
}

function wireHelperName(format: WireFormat, direction: 'encode' | 'decode'): string {
    const action = direction === 'encode' ? 'encode' : 'decode'
    const name = format === 'date' ? 'Date' : format === 'datetime' ? 'DateTime' : 'Duration'
    return `${action}Rpc${name}`
}

function collectWireFormats(schema: zodCore.$ZodType): WireFormatPath[] {
    const results: WireFormatPath[] = []
    const active = new Set<zodCore.$ZodType>()

    const visit = (candidate: unknown, path: readonly (string | number)[]) => {
        if (typeof candidate !== 'object' || candidate === null || !('_zod' in candidate)) return
        const child = candidate as zodCore.$ZodType
        if (active.has(child)) return
        active.add(child)

        const def = child._zod.def as SchemaDef
        if (def.type === 'string' && (def.format === 'date' || def.format === 'datetime' || def.format === 'duration')) {
            results.push({ path, format: def.format, ...(def.format === 'datetime' ? { precision: def.precision } : {}) })
        } else if (def.type === 'object' && def.shape !== undefined) {
            for (const [key, value] of Object.entries(def.shape)) visit(value, [...path, key])
        } else if (def.type === 'array' && def.element !== undefined) {
            visit(def.element, [...path, -1])
        } else if (def.type === 'tuple' && def.items !== undefined) {
            for (const [index, value] of def.items.entries()) visit(value, [...path, index])
            if (def.rest !== undefined) visit(def.rest, [...path, -1])
        } else if (def.type === 'record' && def.valueType !== undefined) {
            visit(def.valueType, [...path, '@record'])
        } else if (def.type === 'union' && def.options !== undefined) {
            for (const value of def.options) visit(value, path)
        } else if (def.type === 'intersection') {
            visit(def.left, path)
            visit(def.right, path)
        } else if (def.innerType !== undefined) {
            visit(def.innerType, path)
        }

        active.delete(child)
    }

    visit(schema, [])
    const unique = new Map<string, WireFormatPath>()
    const pathFormats = new Map<string, WireFormat>()
    for (const item of results) {
        const pathKey = JSON.stringify(item.path)
        const previousFormat = pathFormats.get(pathKey)
        if (previousFormat !== undefined && previousFormat !== item.format) {
            throw new Error(`RPC field ${pathKey} uses incompatible ISO formats: ${previousFormat} and ${item.format}`)
        }
        pathFormats.set(pathKey, item.format)
        unique.set(`${pathKey}:${item.format}`, item)
    }
    return [...unique.values()]
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

function createWireResponseTypeName(rpcName: string, e: RpcEndpointInfo | AdmRpcEndpointInfo) {
    return `RpcWireResp${kebabToPascalCase(rpcName, true)}${kebabToPascalCase(e.name, true)}V${e.v}`
}

function createWireBodyTypeName(rpcName: string, e: RpcEndpointInfo | AdmRpcEndpointInfo) {
    return `RpcWireBody${kebabToPascalCase(rpcName, true)}${kebabToPascalCase(e.name, true)}V${e.v}`
}
