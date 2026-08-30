import type { CreatureCard } from './types'

export const STARTER_DECK_P1: CreatureCard[] = [
  { id: 'p1-goblin', name: 'Goblin', cost: 100, attack: 60, defense: 40, element: 'earth' },
  { id: 'p1-sprite', name: 'Fire Sprite', cost: 120, attack: 70, defense: 35, element: 'fire' },
  { id: 'p1-knight', name: 'Knight', cost: 150, attack: 55, defense: 65, element: 'neutral' },
  { id: 'p1-siren', name: 'Siren', cost: 130, attack: 50, defense: 70, element: 'water' },
  { id: 'p1-hawk', name: 'Wind Hawk', cost: 140, attack: 75, defense: 45, element: 'air' }
]

export const STARTER_DECK_P2: CreatureCard[] = [
  { id: 'p2-imp', name: 'Imp', cost: 100, attack: 65, defense: 38, element: 'fire' },
  { id: 'p2-golem', name: 'Golem', cost: 150, attack: 45, defense: 80, element: 'earth' },
  { id: 'p2-rogue', name: 'Rogue', cost: 120, attack: 70, defense: 40, element: 'neutral' },
  { id: 'p2-nymph', name: 'Nymph', cost: 130, attack: 48, defense: 72, element: 'water' },
  { id: 'p2-bat', name: 'Storm Bat', cost: 140, attack: 72, defense: 42, element: 'air' }
]

export function cloneCard(card: CreatureCard): CreatureCard {
  return { ...card }
}

export function cloneHand(hand: CreatureCard[]): CreatureCard[] {
  return hand.map(cloneCard)
}
