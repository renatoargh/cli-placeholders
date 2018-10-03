const assert = require('assert')
const colors = require('colors')

const readline = require('readline')

class Placeholder {
  constructor (name) {
    this._name = name
    this._value = ''
  }

  set value (value) {
    this._value = value
  }

  get value () {
    return this._value
  }

  get _displayValue () {
    return this.value || this._name
  }

  get length () {
    return this._displayValue.length
  }

  get offset () {
    return this.value ? this.value.length : 0
  }

  get cleanName () {
    return this._name.replace('{', '').replace('}', '')
  }

  render () {
    process.stdout.write(this.value ? this._displayValue.cyan : this._displayValue.cyan.dim)
  }
}

class RegularText {
  constructor (text) {
    assert(text)
    this._text = text
  }

  get length () {
    return this._text.length
  }

  get offset () {
    return this.length
  }

  get selected () {
    return false
  }

  get value () {
    return this._text
  }

  render() {
    process.stdout.write(this._text)
  }
}

class Template {
  constructor (template) {
    this._template = template
    this._results = {}

    const placeholders = template.match(/\{(.*?)\}/g)

    this._placeholders = []
    this._segments = []

    let start = 0
    for(const placeholder of placeholders) {
      const end = template.indexOf(placeholder)

      if (start !== end) {
        const prefix = template.substring(start, end)
        this._segments.push(new RegularText(prefix))
      }

      const plc = new Placeholder(placeholder)
      this._segments.push(plc)
      this._placeholders.push(plc)

      start = end + placeholder.length
    }

    if (this._placeholders.length) {
      this._selectedPlaceholderIndex = 0
      this._placeholders[0].selected = true
    }

    const lastSegment = template.substring(start)
    if(lastSegment) {
      this._segments.push(new RegularText(lastSegment))
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }

    readline.emitKeypressEvents(process.stdin, this.rl)
  }

  get length () {
    return this._segments.reduce((acc, segment) => acc + segment.length, 0)
  }

  get selectedPlaceholder () {
    return this._placeholders[this._selectedPlaceholderIndex]
  }

  get text () {
    return this._segments.map(s => s.value).join('')
  }

  get results () {
    const results = {}
    for(const placeholder of this._placeholders) {
      results[placeholder.cleanName] = placeholder.value
    }

    return results
  }

  render () {
    let offset = 0
    let selectedReached = false
    for(const segment of this._segments) {
      if (segment.selected) {
        selectedReached = true
        offset += segment.offset
      } else {
        offset += selectedReached ? 0 : segment.length
      }

      segment.render()
    }

    readline.moveCursor(process.stdin, this.length * -1, 0)
    readline.moveCursor(process.stdin, offset, 0)
  }

  selectNextPlaceholder() {
    this.selectedPlaceholder.selected = false

    this._selectedPlaceholderIndex++
    if (this._selectedPlaceholderIndex > this._placeholders.length - 1) {
      this._selectedPlaceholderIndex = 0
    }

    this.selectedPlaceholder.selected = true
  }

  async getValues() {
    this.render()

    return new Promise((resolve) => {
      process.stdin.on('keypress', (character, key) => {
        if (key.ctrl && key.name === 'c') {
          readline.moveCursor(process.stdin, this.length * -1, 0)
          readline.clearLine(process.stdin, 0)          
          process.exit()
        }

        if(key.name === 'return') {
          readline.moveCursor(process.stdin, this.length * -1, 0)
          readline.clearLine(process.stdin, 0)
          this.rl.close()

          return resolve({
            template: this._template,
            text: this.text,
            results: this.results 
          })
        }

        if (!character) {
          return
        }

        readline.moveCursor(process.stdin, this.length * -1, 0)
        readline.clearLine(process.stdin, 0)

        const placeholder = this.selectedPlaceholder
        if (key.name === 'backspace') {
          placeholder.value = placeholder.value.slice(0, -1)
        } else {
          if (key.name === 'tab') {
            this.selectNextPlaceholder()
          } else {
            placeholder.value = placeholder.value + character
          }
        }

        this.render()
      })
    })
  }
}


async function main () {
  const template = new Template('POST /devices/{deviceId}/roles/{roleId}/sd')
  const results = await template.getValues()
  console.log(JSON.stringify(results, null, 4))
}

main()