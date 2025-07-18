import { CaipNetwork } from "@reown/appkit"
import { Metadata } from "@walletconnect/universal-provider"
import { SessionTypes } from "@walletconnect/types"

type ExtendedNamespaces = Omit<SessionTypes.Namespace, 'chains' | 'accounts'> & {
    chains: CaipNetwork[]
    namespace: string
  }
  
  export type Config = {
    projectId: string
    metadata: Metadata
    networks: ExtendedNamespaces[]
  }
  