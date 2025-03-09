/**
 * Contents:
 *    HelloRequest
 *    HelloResponse
 *    HelloService
 *    ClientApplication
 *      start
 */
import assert from 'assert';
import { rpcclass, int, float, Dictionary } from '../lib'
import nrpc_ts from '../lib'

@rpcclass({
  name: 1,
  value: 2,
  newonclient: 5
})
class HelloRequest {
  name: string = ''
  value: int = 0
  newonclient: float = 0.0

  constructor(args?: { [key in keyof HelloRequest]?: any }) {
    Object.assign(this, args)
  }
}

@rpcclass({
  summary: 1,
  echo: 2
})
class HelloResponse {
  summary: string = ''
  echo: HelloRequest = null

  constructor(args?: { [key in keyof HelloResponse]?: any }) {
    Object.assign(this, args)
  }
}

@rpcclass({
  Hello: 1,
  Hello2: 2,
})
class HelloService {
  async Hello(request: HelloRequest): Promise<HelloResponse> { return }
  async Hello2(request: any): Promise<any> { return }
}

class ClientApplication {
  async start() {
    const cmd = new nrpc_ts.CommandLine({
      port: 9002,
      format: 'json',
      rate: 1.0,
      verbose: 0,
      from_server: false,
    })

    console.log(`START Client, ${cmd['port']}, ${cmd['from_server']}`)

    const sock = new nrpc_ts.RoutingSocket({
      type: nrpc_ts.SocketType.CONNECT,
      protocol: nrpc_ts.ProtocolType.TCP,
      format: nrpc_ts.FormatType.JSON,
      name: 'test_show_client_ts',
      types: {
        HelloRequest,
        HelloResponse,
        HelloService,
      }
    })

    await sock.connect('127.0.0.1', cmd['port'])

    const client: HelloService = sock.cast(HelloService)

    while (true) {
      await nrpc_ts.sleepAsync(1000 / cmd['rate'])
      const res1 = await sock.server_call('HelloService.Hello', { 'name': 'tester1' })
      console.log(`SEND Hello, 1, ${JSON.stringify(res1)}`)

      const req2 = new HelloRequest({ name: 'tester2', value: 234, newonclient: 555 })
      const res2 = await sock.server_call('HelloService.Hello', req2)
      console.log(`SEND Hello, 2, ${JSON.stringify(res2)}`)

      const req3 = new HelloRequest({ name: 'tester3', value: 444, newonclient: 555 })
      const res3 = await client.Hello(req3)
      console.log(`SEND Hello, 3, ${JSON.stringify(res3)}`)
    }
  }
}

if (require.main === module) {
  nrpc_ts.init()
  new ClientApplication().start()
}