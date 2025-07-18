import { ConnectParams, UniversalProvider } from '@walletconnect/universal-provider';
import { GetAddressesResult, JsonRpcResponse, MethodParamsRaw, MethodsRaw, SignMessageResult } from '../methods';
import { StacksProvider } from '../types/provider';
import { config, stacksMainnet } from './config';
import { bitcoin } from '@reown/appkit/networks';
import { AppKit, CaipNetwork, CreateAppKit, createAppKit } from '@reown/appkit/core';
import { ProposalTypes, SessionTypes } from '@walletconnect/types';
import { Config } from './types';


function jsonRpcResponse<M extends keyof MethodsRaw>(result: unknown): JsonRpcResponse<M> {
  return {
    jsonrpc: '2.0',
    id: 1,
    result
  } as JsonRpcResponse<M>;
}




class WalletConnectProvider implements StacksProvider {
  private appKit: AppKit
  private config: Config
  public provider: Awaited<ReturnType<typeof UniversalProvider.init>>
  


  constructor({
    appKit,
    provider,
    config
  }: {
    appKit: AppKit
    provider: Awaited<ReturnType<typeof UniversalProvider.init>>
    config: Config
  }) {
    this.appKit = appKit
    this.provider = provider
    this.config = config
  }

  public static async init(config: Config) {
    const provider = await UniversalProvider.init({
      projectId: config.projectId,
      metadata: config.metadata
    })

    const appKitConfig: CreateAppKit = {
      networks: Object.values(config.networks).flatMap(network => network.chains) as [
        CaipNetwork,
        ...CaipNetwork[]
      ],
      projectId: config.projectId,
      metadata: config.metadata,
      universalProvider: provider,
      manualWCControl: true
    }
    const appKit = createAppKit(appKitConfig)

    return new WalletConnectProvider({ appKit, provider, config })
  }

  private async connect() {
    try {
      const namespaces: ProposalTypes.OptionalNamespaces =
      this.config?.networks.reduce<ProposalTypes.OptionalNamespaces>((acc, namespace) => {
        acc[namespace.namespace] = {
          ...namespace,
          methods: namespace.methods || [],
          events: namespace.events || [],
          chains: namespace.chains.map((chain: CaipNetwork) => chain.caipNetworkId) || []
        }

        return acc
      }, {})

      this.appKit.open()
      const session = await this.provider.connect({
        optionalNamespaces: namespaces as ConnectParams['optionalNamespaces']
      })

      await this.appKit.close()

      return { session: session as SessionTypes.Struct, provider: this.provider }
    } catch (error) {
      console.error('>> WalletConnectProvider connect error', error);
      throw error;
    }
  }

  private async getAddresses(): Promise<GetAddressesResult> {
    let session = this.provider.session;
    console.log('>> WC session', session);
    if (!session) {
      ({ session } = await this.connect());
    }

    const stacksAddresses = session?.namespaces?.stacks?.accounts || [];
    const btcAddresses = session?.namespaces?.bip122?.accounts || [];
    const caipAddresses = [...stacksAddresses, ...btcAddresses];
    
    const accounts = caipAddresses.map((caipAddress) => {
      const address = caipAddress.split(':')[2];

      // TODO: get public key from the connector
      return { address, publicKey: '' }
    })

    return {
      addresses: accounts
    }
  }

  private validateRpcMethod(method: keyof MethodsRaw) {
    if (!this.provider.session) {
      throw new Error('WalletConnectProvider not connected. Please connect first.');
    }
    const namespaces = this.provider.session.namespaces;
    const stacksMethods = namespaces['stacks']?.methods || [];
    const btcMethods = namespaces['bip122']?.methods || [];
    const methods = [...stacksMethods, ...btcMethods];

    if (!methods.includes(method)) {
      throw new Error(`WalletConnectProvider does not support method ${method}. Please use a supported method.`);
    }
  }

  private getTargetCaipNetworkId(method: keyof MethodsRaw) {
    if (this.provider.session?.namespaces?.stacks?.methods.includes(method)) {
      return stacksMainnet.caipNetworkId;
    }

    if (this.provider.session?.namespaces?.bip122?.methods.includes(method)) {
      return bitcoin.caipNetworkId;
    }

    throw new Error(`WalletConnectProvider does not support method ${method}. Please use a supported method.`);
  }

  async request<M extends keyof MethodsRaw>(method: M, params?: MethodParamsRaw<M>): Promise<JsonRpcResponse<M>> {
    try {
      console.log('>> WalletConnectProvider request', method, params);

      if (method === 'getAddresses') {
        const addresses = await this.getAddresses();
        return jsonRpcResponse(addresses);
      }
  
      this.validateRpcMethod(method);
      const caipNetworkId = this.getTargetCaipNetworkId(method);

      switch (method) {
        case 'stx_signMessage':
          const caipAddress = this.provider.session?.namespaces?.stacks?.accounts[0];
          const address = caipAddress.split(':')[2];
          const result = await this.provider.request({ method, params: { address, ...params } }, caipNetworkId) as SignMessageResult;
          return jsonRpcResponse(result);

        default:
            return await this.provider.request({ method, params }, caipNetworkId) as JsonRpcResponse<M>;
        }
    } catch (error) {
      console.error('>> WalletConnectProvider request error', error);
      throw error;
    }
  }

  async disconnect() {
    await this.provider.disconnect();
    await this.appKit.disconnect();
  }
}


export const initializeWalletConnectProvider = async () => {
  const walletConnectProvider = await WalletConnectProvider.init(config)


  window['WalletConnectProvider'] = walletConnectProvider;
};
