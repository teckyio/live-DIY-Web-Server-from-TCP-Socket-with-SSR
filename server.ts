import net from 'net'
import path from 'path'
import fs from 'fs'
import { print } from 'listening-on'

let server = net.createServer()

function getContentType(pathname: string): string {
  if (pathname.endsWith('.html')) {
    return 'text/html'
  }
  if (pathname.endsWith('.css')) {
    return 'text/css'
  }
  if (pathname.endsWith('.js')) {
    return 'application/javascript'
  }
  if (pathname.endsWith('.json')) {
    return 'application/json'
  }
  return 'text/plain'
}

function escapeHTML(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

type Memo = {
  title: string
  content: string
}
let memos: Memo[] = [
  { title: 'post 1', content: 'text 1' },
  { title: 'post 2', content: 'text 2' },
  { title: 'post 3', content: 'text 3' },
  { title: 'post 4', content: '<b>o</b>' },
  { title: 'post 5', content: '<script>alert("hacked?")</script>' },
  { title: 'post 6', content: "<script>alert('hacked?')</script>" },
]

server.on('connection', socket => {
  console.log('connection established:', socket.remoteAddress)

  function sendBody(input: {
    statusCode: number
    statusText: string
    contentType: string
    body: string | Buffer
  }) {
    let lines = [
      `HTTP/1.1 ${input.statusCode} ${input.statusText}`,
      `Date: ${new Date()}`,
      `Server: DIY Web Server from TCP Socket`,
      `Connection: keep-alive`,
      `Content-Type: ${input.contentType}`,
      `Content-Length: ${input.body.length}`,
    ]
    socket.write(lines.join('\r\n') + '\r\n\r\n')
    socket.write(input.body)
    socket.write('\r\n\r\n')
  }

  function send404(pathname: string) {
    sendBody({
      statusCode: 404,
      statusText: 'Not Found',
      contentType: 'text/html',
      body: pathname + ' not found',
    })
  }

  socket.on('data', chunk => {
    console.log('chunk:')
    console.log('v'.repeat(32))
    console.log(chunk.toString())
    console.log('^'.repeat(32))

    let text = chunk.toString()
    let offset = text.indexOf('\r\n')

    let line = text.slice(0, offset)

    let match = line.match(/(\w+) (.*) HTTP\/1\.1/)
    if (!match) {
      sendBody({
        statusCode: 400,
        statusText: 'invalid protocol',
        contentType: 'text/plain',
        body: 'invalid http request, only HTTP/1.1 is supported',
      })
      socket.end()
      return
    }

    let method = match[1]
    let pathname = match[2]

    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname
    }

    while (pathname.includes('/../')) {
      pathname = pathname.replace('/../', '/')
    }
    while (pathname.includes('../')) {
      pathname = pathname.replace('../', '')
    }

    let headers: Record<string, string> = {}

    offset += 2 // skip \r\n

    for (;;) {
      let lineEnd = text.indexOf('\r\n', offset)
      if (lineEnd == -1) break
      if (lineEnd == offset) break
      let line = text.slice(offset, lineEnd)
      let match = line.match(/([\w-]+): (.*)/)
      if (!match) {
        sendBody({
          statusCode: 400,
          statusText: 'invalid protocol',
          contentType: 'text/plain',
          body: `
invalid http header, line: 
vvvvvvvv
${line}
^^^^^^^^
`.trim(),
        })
        socket.end()
        return
      }
      let key = match[1]
      let value = match[2]
      headers[key] = value
      offset = lineEnd + 2
    }

    offset += 2

    let remind = text.slice(offset)

    console.log({ method, headers })
    if (
      method == 'POST' &&
      headers['Content-Type'] == 'application/x-www-form-urlencoded'
    ) {
      let body = new URLSearchParams(remind)
      if (pathname == '/memo') {
        let title = body.get('title')
        let content = body.get('content')
        if (typeof title !== 'string') {
          sendBody({
            statusCode: 400,
            statusText: 'Bad Request',
            contentType: 'text/plain',
            body: 'invalid title, expect string',
          })
          return
        }
        if (typeof content !== 'string') {
          sendBody({
            statusCode: 400,
            statusText: 'Bad Request',
            contentType: 'text/plain',
            body: 'invalid content, expect string',
          })
          return
        }
        memos.push({ title, content })
        sendBody({
          statusCode: 201,
          statusText: 'Created',
          contentType: 'text/plain',
          body: 'memo saved',
        })
        return
      }
      send404(pathname)
      return
    }

    if (remind != '') {
      console.log('TODO, remind:')
      console.log('v'.repeat(32))
      console.log(remind)
      console.log('^'.repeat(32))
      sendBody({
        statusCode: 510,
        statusText: 'not implemented',
        contentType: 'text/plain',
        body: `reminding body not parsed`,
      })
      socket.end()
      return
    }

    console.log({ method, pathname, remind, headers })

    if (method == 'GET' && pathname == '/memo') {
      sendBody({
        statusCode: 200,
        statusText: 'OK',
        contentType: 'application/json',
        body: JSON.stringify(memos),
      })
      return
    }

    if (method == 'GET' && pathname == '/memo.html') {
      let html = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <title>memos</title>
	<script type="module" src="https://cdn.jsdelivr.net/npm/@ionic/core/dist/ionic/ionic.esm.js"></script>
  <script nomodule src="https://cdn.jsdelivr.net/npm/@ionic/core/dist/ionic/ionic.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@ionic/core/css/ionic.bundle.css" />
</head>
<body>

<ion-page>
  <ion-header>
	  <ion-toolbar color='primary'>
	    <ion-title>
			  Memos
	    </ion-title>
	  </ion-toolbar>
  </ion-header>
	<ion-content>
	  <ion-list>
${memos
  .map(
    memo => /* html */ `
		  <ion-card>
			  <ion-card-title class='ion-padding-horizontal'>
				  ${escapeHTML(memo.title)}
			  </ion-card-title>
				<ion-card-content>
				  ${escapeHTML(memo.content)}
				</ion-card-content>
		  </ion-card>
`,
  )
  .join('')}
	  </ion-list>
	</ion-content>
</ion-page>

</body>
</html>
`
      sendBody({
        statusCode: 200,
        statusText: 'OK',
        contentType: 'text/html',
        body: html,
      })
      return
    }

    if (pathname == '/') {
      pathname = '/index.html'
    }

    let filename = path.join('public', pathname)
    console.log('send file', filename)
    fs.readFile(filename, (err, data) => {
      if (err?.code == 'ENOENT') {
        send404(pathname)
        return
      }

      sendBody({
        statusCode: 200,
        statusText: 'OK',
        contentType: getContentType(pathname),
        body: data,
      })
      socket.end()
    })
  })
})

let port = 8100
server.listen(port, () => {
  print(port)
})
