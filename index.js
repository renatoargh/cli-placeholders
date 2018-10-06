const assert = require('assert')
const colors = require('colors')
const getCursorPosition = require('get-cursor-position');

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
    let value

    if (this.value) {
      if (this.value.startsWith(':')) {
        value = this._displayValue.red
      } else {
        value = this._displayValue.cyan
      }
    } else {
      value = this._displayValue.cyan.dim
    }

    process.stdout.write(value)
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
  constructor (template, {commands = {}} = {}) {
    this._template = template
    this._results = {}
    this._commands = commands

    const placeholders = template.match(/\{(.*?)\}/g) || []

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

    readline.emitKeypressEvents(process.stdin, this.rl)
  }

  get length () {
    return this._segments.reduce((acc, segment) =>
      acc + segment.length, 0
    )
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

  get summary () {
    return {
      template: this._template,
      text: this.text,
      results: this.results
    }
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

  clearLine() {
    readline.clearLine(process.stdin, 0)
    readline.cursorTo(process.stdin, 0)
  }

  async getValues() {
    this.render()

    if (!this._placeholders.length) {
      this.rl.close()
      return this.summary
    }

    return new Promise((resolve) => {
      process.stdin.on('keypress', async (character = '', key) => {
        if (key.ctrl && key.name === 'c') {
          this.clearLine()
          process.exit()
        }

        if(key.name === 'return') {
          this.rl.close()
          return resolve(this.summary)
        }

        this.clearLine()

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

        const command = this._commands[placeholder.value]
        if (command) {
          const {row} = getCursorPosition.sync()
          readline.moveCursor(process.stdin, this.length * -1, 1)

          this.rl.pause()
          placeholder.value = await command(this.rl)
          assert.equal(typeof placeholder.value, 'string', 'command should return a string')

          readline.cursorTo(process.stdout, 0, row - 1)
          readline.clearScreenDown(process.stdout)

          this.render()

          this.rl.resume()
        }
      })
    })
  }
}

module.exports = async (template, options) => {
  return await new Template(template, options).getValues()
}
