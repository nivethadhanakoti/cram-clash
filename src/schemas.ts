/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { decksSchema, questionsSchema } from './schemas/deck-schema'
import {
  answersSchema,
  gamesSchema,
  playersSchema,
  recapsSchema,
} from './schemas/game-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  decksSchema,
  questionsSchema,
  gamesSchema,
  playersSchema,
  answersSchema,
  recapsSchema,
]
