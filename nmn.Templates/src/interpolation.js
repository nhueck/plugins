// @flow

import { getInput } from '../../nmn.sweep/src/userInput'
import { parseJSON5 } from './configuration'

export async function processTemplate(
  content: string,
  config: { [string]: ?mixed },
): Promise<string> {
  const tagStart = content.indexOf('{{')
  const tagEnd = content.indexOf('}}')
  const hasTag = tagStart !== -1 && tagEnd !== -1 && tagStart < tagEnd
  if (!hasTag) {
    return content
  }

  const beforeTag = content.slice(0, tagStart)
  const afterTag = content.slice(tagEnd + 2)
  const tag = content.slice(tagStart + 2, tagEnd)

  try {
    const tagProcessed = await processTag(tag, config)
    const restProcessed = await processTemplate(afterTag, config)
    return beforeTag + tagProcessed + restProcessed
  } catch (e) {
    console.log(e)
    return content
  }
}

async function processTag(
  tag: string,
  config: { [string]: ?mixed },
): Promise<string> {
  if (tag.startsWith('date(') && tag.endsWith(')')) {
    return await processDate(tag.slice(5, tag.length - 1), config)
  }
  const valueInConfig = tag
    // eslint-disable-next-line no-useless-escape
    .split(/[\.\[\]]/)
    .filter(Boolean)
    .reduce(
      (path, key: string) =>
        path != null && typeof path === 'object' ? path[key] : null,
      config.tagValue,
    )
  if (valueInConfig != null) {
    return String(valueInConfig)
  }
  return await getInput(`Value for ${tag}`)
}

async function processDate(
  dateConfig: string,
  config: { [string]: ?mixed },
): Promise<string> {
  const defaultConfig = config.date ?? {}
  const paramConfig = dateConfig.trim() ? await parseJSON5(dateConfig) : {}
  // console.log(`param config: ${dateConfig} as ${JSON.stringify(paramConfig)}`);
  const finalArguments: { [string]: mixed } = {
    ...defaultConfig,
    ...paramConfig,
  }

  const { locale, ...otherParams } = (finalArguments: any)

  const localeParam = locale != null ? String(locale) : []
  const secondParam = {
    dateStyle: 'short',
    ...otherParams,
  }
  // console.log(`${JSON.stringify(localeParam)}, ${JSON.stringify(secondParam)}`);

  return new Intl.DateTimeFormat(localeParam, secondParam).format(new Date())
}