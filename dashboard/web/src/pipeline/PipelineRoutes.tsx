import { useCallback, useEffect, useRef, useState } from 'react'
import { App as AntApp, ConfigProvider, Result, Button } from 'antd'
import { FileSearchOutlined } from '@ant-design/icons'
import type { PipelineOverview } from '../types'
import { api, reportBySlug } from './api'
import { pipelineTheme, usePrefersDark } from './theme'
import { ImportList } from './ImportList'
import { ReportFile } from './ReportFile'

/**
 * #/pipeline                      — the list of imported files
 * #/pipeline/<report-slug>/<id>   — the rows of one imported file (?page=&size=)
 *
 * The overview (files, load events, processor) is fetched once here and
 * shared, so moving between the list and a file does not refetch it.
 */
export function PipelineRoutes({ hash, onUnauthorized }: { hash: string; onUnauthorized: () => void }) {
  const dark = usePrefersDark()
  const [ov, setOv] = useState<PipelineOverview | null>(null)
  const [ovError, setOvError] = useState('')
  // App passes a fresh closure each render; keep the latest without refetching.
  const unauthorized = useRef(onUnauthorized)
  unauthorized.current = onUnauthorized
  const onUnauth = useCallback(() => unauthorized.current(), [])

  const loadOverview = useCallback(() => {
    return api<PipelineOverview>('/api/pipeline', undefined, onUnauth)
      .then((d) => {
        if (d) {
          setOv(d)
          setOvError('')
        }
      })
      .catch((e: Error) => setOvError(e.message || 'The pipeline API is unavailable. Start it with: go run ./dashboard/api'))
  }, [onUnauth])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  const [path, qs] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean) // ['pipeline', slug?, id?]
  const query = new URLSearchParams(qs ?? '')

  let page: JSX.Element
  if (parts.length === 1) {
    page = <ImportList ov={ov} error={ovError} reload={loadOverview} onUnauthorized={onUnauth} />
  } else {
    const report = reportBySlug(parts[1] ?? '')
    const id = Number(parts[2])
    if (report && parts.length === 3 && Number.isInteger(id) && id > 0) {
      page = <ReportFile key={id} report={report} fileId={id} query={query} ov={ov} onUnauthorized={onUnauth} />
    } else {
      page = (
        <Result
          icon={<FileSearchOutlined className="result-icon" />}
          title="This pipeline page does not exist"
          subTitle="The link may be from an older version of the dashboard."
          extra={
            <Button type="primary" href="#/pipeline">
              Open the import list
            </Button>
          }
        />
      )
    }
  }

  return (
    <ConfigProvider theme={pipelineTheme(dark)}>
      <AntApp component={false}>
        <div className="app pipeline">{page}</div>
      </AntApp>
    </ConfigProvider>
  )
}
