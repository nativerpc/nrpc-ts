import assert from 'assert'

type int = number
type float = number
interface Dictionary<K, T> {
    [key: string]: T;
}
type Type = new (...args: any[]) => {}
interface Dict<T> {
    [key: string]: T;
}
interface ReadOnlyDict<T> {
    readonly [key: string]: T;
}

class LinkedListItem<T> {
    value: T
    next: LinkedListItem<T> | null
    prev: LinkedListItem<T> | null

    constructor(val: T) {
        this.value = val;
        this.next = null;
        this.prev = null;
    }
}

class LinkedList<T> {
    _head: LinkedListItem<T> | null
    _tail: LinkedListItem<T> | null
    _length: number

    constructor(...values) {
        this._head = this._tail = null;
        this._length = 0;
        if (values.length > 0) {
            values.forEach((value) => {
                this.append(value);
            });
        }
    }
    
    *iterator() {
        let currentItem = this._head;
        while (currentItem) {
            yield currentItem.value;
            currentItem = currentItem.next;
        }
    }
    
    [Symbol.iterator]() {
        return this.iterator();
    }
    
    get head() {
        return this._head ? this._head.value : null;
    }
    
    get tail() {
        return this._tail ? this._tail.value : null;
    }
    
    get length() {
        return this._length;
    }
    
    // Adds the element at a specific position inside the linked list
    insert(val, previousItem) {
        let newItem = new LinkedListItem(val);
        let currentItem = this._head;
        if (!currentItem) {
            return false;
        }
        else {
            while (true) {
                if (currentItem.value === previousItem) {
                    newItem.next = currentItem.next;
                    newItem.prev = currentItem;
                    currentItem.next = newItem;
                    if (newItem.next) {
                        newItem.next.prev = newItem;
                    }
                    else {
                        this._tail = newItem;
                    }
                    this._length++;
                    return true;
                }
                else {
                    if (currentItem.next) {
                        currentItem = currentItem.next;
                    }
                    else {
                        // can't locate previousItem
                        return false;
                    }
                }
            }
        }
    }

    // Adds the element at the end of the linked list
    append(val) {
        let newItem = new LinkedListItem(val);
        if (!this._tail) {
            this._head = this._tail = newItem;
        }
        else {
            this._tail.next = newItem;
            newItem.prev = this._tail;
            this._tail = newItem;
        }
        this._length++;
        return true;
    }

    // Add the element at the beginning of the linked list
    prepend(val) {
        let newItem = new LinkedListItem(val);
        if (!this._head) {
            this._head = this._tail = newItem;
        }
        else {
            newItem.next = this._head;
            this._head.prev = newItem;
            this._head = newItem;
        }
        this._length++;
        return true;
    }
    
    remove(val) {
        let currentItem = this._head;
        if (!currentItem) {
            return;
        }
        if (currentItem.value === val) {
            this._head = currentItem.next;
            assert(this._head)
            this._head.prev = null;
            currentItem.next = currentItem.prev = null;
            this._length--;
            return currentItem.value;
        }
        else {
            while (true) {
                if (currentItem.value === val) {
                    if (currentItem.next) { // special case for last element
                        assert(currentItem.prev)
                        currentItem.prev.next = currentItem.next;
                        currentItem.next.prev = currentItem.prev;
                        currentItem.next = currentItem.prev = null;
                    }
                    else {
                        assert(currentItem.prev)
                        currentItem.prev.next = null;
                        this._tail = currentItem.prev;
                        currentItem.next = currentItem.prev = null;
                    }
                    this._length--;
                    return currentItem.value;
                }
                else {
                    if (currentItem.next) {
                        currentItem = currentItem.next;
                    }
                    else {
                        return;
                    }
                }
            }
        }
    }

    removeHead(): T {
        let currentItem = this._head;
        // empty list
        if (!currentItem) {
            return;
        }
        
        // single item list
        assert(this._head)
        if (!this._head.next) {
            this._head = null;
            this._tail = null;
            // full list
        }
        else {
            this._head.next.prev = null;
            this._head = this._head.next;
            currentItem.next = currentItem.prev = null;
        }
        this._length--;
        return currentItem.value;
    }
    
    removeTail() {
        let currentItem = this._tail;
        // empty list
        if (!currentItem) {
            return;
        }
        assert(this._tail)

        // single item list
        if (!this._tail.prev) {
            this._head = null;
            this._tail = null;
            // full list
        }
        else {
            this._tail.prev.next = null;
            this._tail = this._tail.prev;
            currentItem.next = currentItem.prev = null;
        }
        this._length--;
        return currentItem.value;
    }

    first(num): T[] {
        let iter = this.iterator();
        let result: any[] = [];
        let n = Math.min(num, this.length);
        
        for (let i = 0; i < n; i++) {
            const val = iter.next();
            result.push(val.value);
        }
    
        return result;
    }

    toArray(): T[] {
        // @ts-ignore
        return [...this];
    }
}

const annotation_name = 'rpcclass'
const annotation_final_compiler_name = 'annotation_final_compiler'
const annotation_compiler = 'ts-patch/compiler'
const annotation_transpiler = 'test_transpiler.ts'
const annotation_final_compiler = 'default'

export {
    type int,
    type float,
    type Dict,
    type ReadOnlyDict,
    type Dictionary,
    type Type,
    LinkedList,
    annotation_name,
    annotation_final_compiler,
}