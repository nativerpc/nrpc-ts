/**
 * Contents:
 *    HelloRequest
 *    HelloResponse
 *    HelloService
 *    ServerApplication
 *        start
 *        Hello
 *        Hello2
 */
import assert from 'assert'
import { rpcclass, int, float, Dictionary } from '../lib'
import nrpc_ts from '../lib'
import child_process from 'node:child_process'
import util from 'node:util'
import path from 'node:path'

@rpcclass({
  name: 1,
  value: 2,
  newonserver: 4
})
class HelloRequest {
  name: string = ''
  value: int = 0
  newonserver: float = 0.0

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

class ServerApplication {
  call_count: number = 0

  async start() {
    const cmd = new nrpc_ts.CommandLine({
      port: 9002,
      format: 'json',
      rate: 1.0,
      verbose: 0,
    })

    const sock = new nrpc_ts.RoutingSocket({
      type: nrpc_ts.SocketType.BIND,
      protocol: nrpc_ts.ProtocolType.TCP,
      format: nrpc_ts.FormatType.JSON,
      port: cmd['port'],
      types: {
        HelloRequest,
        HelloResponse,
        HelloService: [HelloService, this],
      },
      caller: 'test_show_ts',
    })


    console.log(`START Server, port=${cmd['port']}`)
    await sock.bind('127.0.0.1', cmd['port'])

    const this_dir = path.dirname(__filename).replaceAll('\\', '/')
    console.log(`EXEC test/test_show_client.ts`)
    await nrpc_ts.execCommand(
        `node node_modules/ts-node/dist/bin.js ${this_dir}/test_show_client.ts from_server=1 port=${cmd['port']} rate=${cmd['rate']}`
    )

    // while (true) {
    //   await nrpc_ts.sleepAsync(1000 / cmd['rate'])
    //   for (const client_id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    //     if (!sock.server_socket.get_client_ids().includes(client_id)) {
    //       continue
    //     }
    //     const res = await sock.client_call(client_id, nrpc_ts.RoutingMessage.GetAppInfo, {})
    //     console.log(`SEND GetAppInfo, ${client_id}, ${res["entry_file"]}, ${res["this_socket"]}`)
    //   }
    // }

    sock.close()
  }

  async Hello(request: HelloRequest): Promise<HelloResponse> {
    this.call_count += 1
    console.log(`CALL ServerApplication.Hello, name=${request.name} value=${request.value}`)
    return new HelloResponse({ summary: `hello-${this.call_count}`, echo: request })
  }
  async Hello2(request: any): Promise<any> {
    this.call_count += 1
    console.log(`CALL ServerApplication.Hello2, name=${request['name']} value=${request['value']}`)
    return {
      summary: `hello-${this.call_count}`,
      echo: request
    }
  }
}

if (require.main === module) {
  nrpc_ts.init()
  const app = new ServerApplication()
  app.start()
}

