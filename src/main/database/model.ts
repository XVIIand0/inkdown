import Knex from 'knex'
import { app } from 'electron'
import { join } from 'path'

export const knex = Knex({
  client: 'better-sqlite3',
  useNullAsDefault: true,
  connection: {
    filename: join(app.getPath('userData'), 'data.sqlite')
  }
})
console.log('app', app.getPath('userData'))

export const initModel = async () => {
  await knex.schema.hasTable('client').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('client', (t) => {
        t.string('id').primary()
        t.string('name')
        t.text('baseUrl').nullable()
        t.string('mode')
        t.integer('sort').defaultTo(0)
        t.string('apiKey').nullable()
        t.text('models').nullable()
        t.text('options').nullable()
      })
    }
  })

  await knex.schema.hasTable('chat').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('chat', (t) => {
        t.string('id').primary()
        t.text('topic').nullable()
        t.integer('created').defaultTo(Date.now())
        t.integer('updated').defaultTo(Date.now())
        t.string('promptId').nullable()
        t.boolean('websearch').defaultTo(false)
        t.boolean('docContext').defaultTo(false)
        t.string('model').nullable()
        t.string('clientId').nullable()
        t.integer('summaryIndex').defaultTo(0)
        t.text('summary').nullable()
      })
    }
  })

  await knex.schema.hasTable('message').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('message', (t) => {
        t.string('id').primary()
        t.string('chatId')
        t.string('role')
        t.text('content')
        t.integer('created').defaultTo(Date.now())
        t.integer('updated').defaultTo(Date.now())
        t.integer('tokens').defaultTo(0)
        t.text('reasoning').nullable()
        t.integer('duration').defaultTo(0)
        t.boolean('terminated').defaultTo(false)
        t.string('model').nullable()
        t.integer('height').nullable()
        t.text('error').nullable()
        t.text('files').nullable()
        t.text('docs').nullable()
        t.text('context').nullable()
        t.text('images').nullable()
        t.foreign('chatId').references('id').inTable('chat').onDelete('CASCADE')
      })
    }
  })

  await knex.schema.hasTable('prompt').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('prompt', (t) => {
        t.string('id').primary()
        t.text('name')
        t.text('content')
        t.integer('sort').defaultTo(0)
      })
    }
  })

  await knex.schema.hasTable('setting').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('setting', (t) => {
        t.string('key').primary()
        t.text('value')
      })
    }
  })

  await knex.schema.hasTable('space').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('space', (t) => {
        t.string('id').primary()
        t.text('name')
        t.integer('created').defaultTo(Date.now())
        t.integer('lastOpenTime').defaultTo(Date.now())
        t.integer('sort').defaultTo(0)
        t.text('writeFolderPath').nullable()
        t.text('opt').nullable()
      })
    }
  })

  await knex.schema.hasTable('doc').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('doc', (t) => {
        t.string('id').primary()
        t.text('name')
        t.string('spaceId')
        t.string('parentId').defaultTo('root')
        t.boolean('folder').defaultTo(false)
        t.text('schema').nullable()
        t.integer('updated').defaultTo(Date.now())
        t.integer('deleted').defaultTo(0)
        t.integer('created').defaultTo(Date.now())
        t.integer('sort').defaultTo(0)
        t.text('links').nullable()
        t.text('medias').nullable()
        t.text('summary').nullable()
        t.integer('lastOpenTime').defaultTo(Date.now())
        t.foreign('spaceId').references('id').inTable('space').onDelete('CASCADE')
      })
    }
  })

  await knex.schema.hasTable('file').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('file', (t) => {
        t.string('name').primary()
        t.integer('created').defaultTo(Date.now())
        t.integer('size').defaultTo(0)
        t.string('spaceId').nullable()
        t.string('messageId').nullable()
        t.foreign('messageId').references('id').inTable('message').onDelete('CASCADE')
        t.foreign('spaceId').references('id').inTable('space').onDelete('CASCADE')
      })
    }
  })

  await knex.schema.hasTable('history').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('history', (t) => {
        t.string('id').primary()
        t.string('docId')
        t.text('schema')
        t.string('spaceId')
        t.integer('created').defaultTo(Date.now())
        t.text('links').nullable()
        t.text('medias').nullable()
        t.foreign('spaceId').references('id').inTable('space').onDelete('CASCADE')
        t.foreign('docId').references('id').inTable('doc').onDelete('CASCADE')
      })
    }
  })
  await knex.schema.hasTable('keyboard').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('keyboard', (t) => {
        t.string('task').primary()
        t.text('key')
      })
    }
  })

  await knex.schema.hasTable('mind_note').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('mind_note', (t) => {
        t.string('id').primary()
        t.text('title')
        t.string('scope').defaultTo('global')
        t.text('projectPath').nullable()
        t.text('content').nullable()
        t.integer('created').defaultTo(Date.now())
        t.integer('updated').defaultTo(Date.now())
        t.integer('sort').defaultTo(0)
      })
    }
  })

  await knex.schema.hasTable('ssh_host').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('ssh_host', (t) => {
        t.string('id').primary()
        t.text('name').notNullable()
        t.text('hostname').notNullable()
        t.integer('port').defaultTo(22)
        t.text('username').notNullable()
        t.text('authMethod').defaultTo('key')
        t.text('identityFile').nullable()
        t.text('password').nullable()
        t.text('iconType').defaultTo('default')
        t.text('iconValue').nullable()
        t.integer('sort').defaultTo(0)
        t.integer('created')
        t.integer('updated')
      })
    }
  })

  await knex.schema.hasTable('session_alias').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('session_alias', (t) => {
        t.string('id').primary() // format: hostId|projectId|sessionId
        t.text('alias').notNullable()
        t.integer('updated').defaultTo(Date.now())
      })
    }
  })

  await knex.schema.hasTable('project_config').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('project_config', (t) => {
        t.string('id').primary() // format: hostId|projectId
        t.text('iconType').defaultTo('default') // 'default' | 'color' | 'image'
        t.text('iconValue').nullable()
        t.integer('sort').defaultTo(0)
        t.integer('updated').defaultTo(Date.now())
      })
    }
  })

  await knex.schema.hasColumn('project_config', 'displayName').then((exists) => {
    if (!exists) {
      return knex.schema.alterTable('project_config', (t) => {
        t.text('displayName').nullable()
      })
    }
  })

  await knex.schema.hasTable('session_pin').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('session_pin', (t) => {
        t.string('id').primary() // format: hostId|projectId|sessionId
        t.integer('created').defaultTo(Date.now())
      })
    }
  })

  await knex.schema.hasTable('ssh_remote_cache').then((exists) => {
    if (!exists) {
      return knex.schema.createTable('ssh_remote_cache', (t) => {
        t.string('id').primary()
        t.text('hostId').notNullable()
        t.text('projectId').notNullable()
        t.text('sessionId').notNullable()
        t.text('data').nullable()
        t.integer('cachedAt')
      })
    }
  })
}
