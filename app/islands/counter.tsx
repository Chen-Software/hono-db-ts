import { css } from '../../styled-system/css'
import { useState } from 'hono/jsx'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p class={css({ py: 2, fontSize: '2xl' })}>{count}</p>
      <button
        class={css({
          px: 4,
          py: 2,
          bg: 'accent',
          color: 'white',
          rounded: 'md',
          cursor: 'pointer',
        })}
        onClick={() => setCount(count + 1)}
      >
        Increment
      </button>
    </div>
  )
}
