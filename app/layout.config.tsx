import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: 'tamagotchi',
  },
  links: [
    {
      text: 'skills',
      url: '/docs/skills',
      active: 'nested-url',
    },
    {
      text: 'source',
      url: 'https://github.com/prathamVaidya/gochi',
      external: true,
    },
  ],
}
