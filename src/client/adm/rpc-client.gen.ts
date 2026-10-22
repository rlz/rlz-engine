import { AdmAuthParam, admRpcCall } from "../rpc.js";
export type RpcBodyAuthVerifyV1 = {};
export type RpcRespAuthVerifyV1 = {
    ok: true;
};
export const ADM_AUTH_RPC_CLIENT = { auth: { verify: async (auth: AdmAuthParam, body: RpcBodyAuthVerifyV1): Promise<RpcRespAuthVerifyV1> => {
            return await admRpcCall(auth, "auth", "verify", 1, body);
        } } };
