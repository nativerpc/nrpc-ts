import assert from 'assert'

interface ListManagerOptions {
    table: string[]
    template: string[]
    sort: boolean
}

type KeyType = number | string

interface UpdateOptions {
    key: KeyType[]
    [property_name: string]: any
}

interface CellItem {
    row_id: KeyType
    cell_id: KeyType
    cell_element: HTMLElement
    updated: boolean
}

interface RowItem {
    row_id: KeyType
    row_element: HTMLElement
    cell_list_element: HTMLElement
    updated: boolean
    cell_items: { [key: KeyType]: CellItem }
}

class ListManager {
    table_element: HTMLElement
    row_item_id: string
    row_template: HTMLElement
    cell_list_id: string
    cell_item_id: string
    cell_template: HTMLElement
    row_items: {
        [key: KeyType]: RowItem
    }
    update_count: number
    change_count: number
    sort: boolean
    selected_cell_item_: CellItem

    constructor(options: ListManagerOptions) {
        this.table_element = document.querySelector(options.table[0])
        this.cell_list_id = options.table[1]
        this.row_item_id = options.template[0]
        this.cell_item_id = options.template[1]
        assert(this.row_item_id.startsWith('.'))
        assert(this.cell_item_id.startsWith('.'))
        assert(this.table_element)
        this.row_template = this.table_element.querySelector(this.row_item_id)
        assert(this.row_template)
        this.cell_template = this.row_template.querySelector(this.cell_list_id).querySelector(this.cell_item_id)
        assert(this.cell_template)
        this.row_items = {}
        this.update_count = 0
        this.change_count = 0
        this.sort = options.sort
        this.selected_cell_item_ = null
    }

    select(options: {cell?: HTMLElement, clear?: boolean}) {
        if (options.cell) {
            assert(options.cell.getAttribute('key'), 'No key on selected item!')
            assert(options.cell.getAttribute('key').includes(':'), 'Invalid key on selected item!')
            const parts = options.cell.getAttribute('key').split(':')
            if (this.selected_cell_item_ && this.selected_cell_item_.cell_element) {
                this.selected_cell_item_.cell_element.setAttribute('selected', '0')
            }
            options.cell.setAttribute('selected', '1')
            const cell_item: CellItem = {
                cell_element: options.cell,
                row_id: parseInt(parts[0]),
                cell_id: parseInt(parts[1]),
                updated: false,
            }
            this.selected_cell_item_ = cell_item
        }
        else if (options.clear !== undefined) {
            if (this.selected_cell_item_ && this.selected_cell_item_.cell_element) {
                this.selected_cell_item_.cell_element.setAttribute('selected', '0')
                // this.selected_cell = null
              }
          
        }
        else {
            assert(false)
        }
    }

    get selected_cell_item() {
        return this.selected_cell_item_
    }

    sync(update: UpdateOptions[]) {
        for (const row of Object.values(this.row_items)) {
            row.updated = false
            for (const cell of Object.values(row.cell_items)) {
                cell.updated = false
            }

        }

        for (const item of update) {
            let parent_element: HTMLElement = null
            let parent_row: RowItem = null
            let parent_cell: CellItem = null

            if (item.key.length == 0) {
                parent_element = this.table_element
            }
            else if (item.key.length == 1) {
                if (!(item.key[0] in this.row_items)) {
                    const row = this.row_template.cloneNode(true) as HTMLElement
                    row.style.removeProperty('display')
                    row.setAttribute('key', `${item.key[0]}`)
                    this.table_element.appendChild(row)
                    const row_item: RowItem = {
                        row_id: item.key[0],
                        row_element: row,
                        cell_list_element: row.querySelector(this.cell_list_id),
                        updated: false,
                        cell_items: {},
                    }
                    this.row_items[item.key[0]] = row_item
                    this.update_count += 1
                }
                parent_row = this.row_items[item.key[0]]
                parent_row.updated = true
                parent_element = parent_row.row_element
            }
            else {
                assert(item.key[0] in this.row_items)
                parent_row = this.row_items[item.key[0]]
                parent_row.updated = true
                if (!(item.key[1] in parent_row.cell_items)) {
                    const cell = this.cell_template.cloneNode(true) as HTMLElement
                    cell.style.removeProperty('display')
                    cell.setAttribute('key', `${item.key[0]}:${item.key[1]}`)
                    parent_row.cell_list_element.appendChild(cell)
                    const cell_item: CellItem = {
                        row_id: item.key[0],
                        cell_id: item.key[1],
                        cell_element: cell,
                        updated: false,
                    }
                    parent_row.cell_items[item.key[1]] = cell_item
                    this.update_count += 1
                }
                parent_cell = parent_row.cell_items[item.key[1]]
                parent_cell.updated = true
                parent_element = parent_cell.cell_element
            }

            assert(parent_element)

            for (const [property_name, property_value] of Object.entries(item)) {
                if (property_name == 'key') {
                    continue
                }

                assert(property_name.trim())

                const parts: string[] = property_name.split(' ')
                const prop_name = parts[parts.length - 1]
                const child = parts.length <= 1 ? parent_element : parent_element.querySelector(parts.slice(0, parts.length - 1).join(' '))

                if (prop_name == 'text') {
                    if (child.textContent != property_value) {
                        child.textContent = property_value
                        this.change_count += 1
                    }
                }
                else if (prop_name == 'html') {
                    if (child.innerHTML != property_value) {
                        child.innerHTML = property_value
                        this.change_count += 1
                    }
                }
                else {
                    if (child.getAttribute(prop_name) != property_value) {
                        child.setAttribute(prop_name, property_value)
                        this.change_count += 1
                    }
                }
            }
        }
    }
}

export {
    type ListManagerOptions,
    type UpdateOptions,
    type CellItem,
    type RowItem,
    ListManager,
}
