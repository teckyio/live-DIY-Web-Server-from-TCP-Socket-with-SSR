loading.remove()

fetch('/memo')
  .then(res => res.json())
  .then(memos => {
    memos.forEach(memo => {
      let node = memoTemplate.content.firstElementChild.cloneNode(true)
      node.querySelector('.title').textContent = memo.title
      node.querySelector('.content').textContent = memo.content
      memoList.appendChild(node)
    })
  })
