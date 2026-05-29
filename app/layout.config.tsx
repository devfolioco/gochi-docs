import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: 'tamagotchi',
  },
  links: [
    {
      text: 'playground',
      url: '/circuit',
    },
    {
      text: 'source',
      url: 'https://github.com/devfolioco/gochi',
      external: true,
    },
  ],
}
