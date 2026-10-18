import fs from 'node:fs'

const archive = 'D:\\DeepSeek Harness\\resources\\app.asar'
const needle = process.argv[2] ?? ''
const fd = fs.openSync(archive, 'r')
try {
  const prefix = Buffer.alloc(16)
  fs.readSync(fd, prefix, 0, 16, 0)
  const headerSize = prefix.readUInt32LE(12)
  const headerBuf = Buffer.alloc(headerSize)
  fs.readSync(fd, headerBuf, 0, headerSize, 16)
  const header = JSON.parse(headerBuf.toString('utf8'))
  const walk = (node, base) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const path = base === '' ? name : base + '/' + name
      if (child.files) walk(child, path)
      else if (path.includes(needle)) console.log(path)
    }
  }
  walk(header, '')
} finally {
  fs.closeSync(fd)
}
