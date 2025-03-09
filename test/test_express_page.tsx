/**
 * Contents:
 *      AppInfo
 *      AppService
 *      PageApplication
 *          constructor
 *          start
 *          loop
 *          render_ui
 *          on_root_click
 *          on_button_click
 *          on_click_extra
 */
import nrpc_ts, { rpcclass } from '../lib'
import './test_express_page.css'

interface AppInfo {
    client_id: number
    main_page: string
    port: number
    client_count: number
}

@rpcclass({ get_app_info: 1 })
class AppService {
    async get_app_info(req: any): Promise<AppInfo> { return }
}

class PageApplication {
    cmd_: nrpc_ts.CommandLine
    sock_: nrpc_ts.ServingSocket
    client_: AppService
    click_count_: number
    app_info_: AppInfo

    async start() {
        this.click_count_ = 0
        this.app_info_ = null
        this.cmd_ = new nrpc_ts.CommandLine({
            port: 0,
            format: '',
            rate: 1.0,
            verbose: false,
        })
        this.sock_ = new nrpc_ts.ServingSocket({
            type: nrpc_ts.SocketType.CONNECT,
            protocol: nrpc_ts.ProtocolType.HTTP,
            format: nrpc_ts.FormatType.JSON,
            types: {
                AppService,
            },
            name: 'test_express_page_ts'
        })

        // @ts-ignore
        const status = document.querySelector('.app .status') as HTMLElement
        status.textContent = 'client=- total=- click=0'

        await this.sock_.connect('127.0.0.1', this.cmd_['port'])

        this.client_ = this.sock_.cast(AppService)
        this.app_info_ = await this.client_.get_app_info({client_id: this.sock_.client_id})

        console.log(`Client started, port=${this.sock_.port}, page=${this.app_info_.main_page}`)
        console.log('Client metadata: ', this.sock_.client_info)
    }

    async loop() {
        while (this.sock_.is_alive) {
            await nrpc_ts.sleepAsync(1000)
            //   console.log('Working')
            this.app_info_ = await this.client_.get_app_info({client_id: this.sock_.client_id})
            this.render_ui()
        }
        this.sock_.close()
    }

    render_ui() {
        // @ts-ignore
        const status = document.querySelector('.app .status') as HTMLElement
        const text = `
            client=#${this.sock_.client_id} total=${this.app_info_.client_count} click=${this.click_count_}
        `
        status.textContent = text
    }

    on_root_click() {
        // @ts-ignore
        window.event.stopPropagation()
        this.click_count_ += 1
        console.log(`Clicked ${this.click_count_}`)
        this.render_ui()
    }

    on_button_click() {
        // @ts-ignore
        window.event.stopPropagation()
        console.log(`Button click`)
        // @ts-ignore
        const button_1 = document.getElementById('button-1')
        button_1.setAttribute('active', button_1.getAttribute('active') == '0' ? '1' : '0')
        this.render_ui()
    }

    on_click_extra() {
        // @ts-ignore
        window.event.stopPropagation()
        // @ts-ignore
        const button2 = document.querySelector('#button-2') as any
        button2.setAttribute('active', button2.getAttribute('active') == '0' ? '1' : '0')
        button2.querySelector('.input').value = parseInt(button2.getAttribute('active'))
        this.render_ui()
    }
}

nrpc_ts.init()
const app = new PageApplication()
global.application = app
app.start().then(() => app.loop())

