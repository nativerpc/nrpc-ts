/**
 * Contents:
 *      AppInfo
 *      AppService
 *      TestApplication
 *          start
 *          get_app_info
 */
import nrpc_ts, { rpcclass } from '../lib'

interface AppInfo {
  client_id: number
  main_page: string
  port: number
  client_count: number
}

@rpcclass({get_app_info: 1})
class AppService {
  async get_app_info(req: any): Promise<AppInfo> { return }
}

class TestApplication {
  cmd_: nrpc_ts.CommandLine
  sock_: nrpc_ts.ServingSocket

  async start() {
    this.cmd_ = new nrpc_ts.CommandLine({
        'port': 9000,
        'rate': 1,
    })

    this.sock_ = new nrpc_ts.ServingSocket({
      type: nrpc_ts.SocketType.BIND,
      protocol: nrpc_ts.ProtocolType.HTTP,
      format: nrpc_ts.FormatType.JSON,
      main_page: 'test/test_express_page.tsx',
      static_dir: 'test/test_show/resources',
      types: {
        AppService: [AppService, this],
      },
      name: 'test_express_ts',
      command_line: this.cmd_,
    })
  
    console.log(`Server start, port=${this.cmd_['port']}`)
    
    await this.sock_.bind('127.0.0.1', this.cmd_['port'])

    while (this.sock_.is_alive) {
      await nrpc_ts.sleepAsync(1000 / this.cmd_['rate'])
      // console.log('Working')
    }

    this.sock_.close()
  }

  async get_app_info(req: any): Promise<AppInfo> {
    const client = this.sock_.clients.find(item => item.client_id == req['client_id'])
    const resp: AppInfo = { 
      client_id: client.client_id,
      main_page: this.sock_.main_page,
      port: this.cmd_['port'],
      client_count: this.sock_.clients.length,
    }
    return resp
  }
}

if (require.main === module) {
  nrpc_ts.init()
  const app = new TestApplication()
  app.start()
}

