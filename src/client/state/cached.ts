// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cacheLastResult<FnT extends (...args: any) => unknown>(fn: FnT): FnT {
    let lastArgs: Parameters<FnT> | null = null
    let lastResult: ReturnType<FnT> | undefined = undefined

    return ((...args: Parameters<FnT>): ReturnType<FnT> => {
        if (lastArgs !== null && lastArgs.every((arg, i) => arg === args[i])) {
            return lastResult!
        }

        lastArgs = args
        lastResult = fn(...args) as ReturnType<FnT>

        return lastResult!
    }) as FnT
}
