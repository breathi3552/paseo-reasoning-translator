import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { connectionQueryOptions } from "../shared/connection";
import { getConnection } from "../shared/rpc";

export function useConnection(hostId: string) {
  const read = useRpc(getConnection);
  return useQuery(connectionQueryOptions(hostId, () => read({})));
}
