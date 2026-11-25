import { formatNum, type SiteData } from '../lib/model'
import { Card, SectionHead } from './ui'

const DATASETS = [
  {
    org: '한국체육산업개발',
    name: '올림픽공원 입출차정보(전체구역)',
    role: '예보의 기준이 되는 시간대별 주차 대수와 출입문 비율',
    href: 'https://www.data.go.kr/data/15159093/openapi.do',
  },
  {
    org: '한국체육산업개발',
    name: '올림픽공원 차량입출차·공연·날씨 연계 데이터',
    role: '2025년 공연명·관람객 수·공연 시간대',
    href: 'https://www.data.go.kr/data/15164822/openapi.do',
  },
  {
    org: '한국체육산업개발',
    name: '올림픽공원 실시간 주차현황',
    role: '지금 동2·남2·북2문 주차장에 있는 차량 수',
    href: 'https://www.data.go.kr/data/15168686/openapi.do',
  },
  {
    org: '한국체육산업개발',
    name: '올림픽공원 공연/행사 일정안내',
    role: '오늘부터 사흘 안의 공연과 공연장 규모',
    href: 'https://www.ksponco.or.kr/olympicpark/menu.es?mid=a20301010000',
  },
  {
    org: '서울특별시',
    name: '서울시 실시간 도시데이터 (올림픽공원)',
    role: '지금 공원 안 인구 범위와 혼잡도',
    href: 'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do',
  },
  {
    org: '기상청',
    name: '단기예보 조회서비스',
    role: '고른 시간의 기온·하늘·강수확률',
    href: 'https://www.data.go.kr/data/15084084/openapi.do',
  },
]

const PLANNED: string[] = []

export function DataMethod({ site }: { site: SiteData }) {
  const s = site.source
  return (
    <section aria-labelledby="method" className="pt-20 sm:pt-28">
      <SectionHead id="method" title="데이터와 계산 방법" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <p className="text-[15px] font-medium">사용한 공공데이터</p>
          <ul className="mt-4 flex flex-col">
            {DATASETS.map((d) => (
              <li key={d.name} className="border-t border-line py-3 first:border-t-0">
                <a href={d.href} target="_blank" rel="noreferrer" className="text-[14px] text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  {d.org} · {d.name}
                </a>
                <p className="mt-1 text-[13px] text-ink-2">{d.role}</p>
              </li>
            ))}
          </ul>
          {PLANNED.length > 0 && (
            <>
              <p className="mt-4 text-[13px] text-ink-3">연결 중인 데이터</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-2">
                {PLANNED.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-[15px] font-medium">예보는 이렇게 계산해요</p>
          <ol className="mt-4 flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
            <li>
              <span className="text-ink">1.</span> 2025년 입출차 기록으로 시간마다 주차장에 있던 차를 셉니다
            </li>
            <li>
              <span className="text-ink">2.</span> 공연이 없던 날만 모아 요일·시각별 중앙값으로 기준표를 만듭니다
            </li>
            <li>
              <span className="text-ink">3.</span> 공연이 있던 시간대가 기준표보다 얼마나 많았는지로 공연 영향을 구하고, 앞으로의 공연은
              공연장 규모에 맞는 값을 16–20시에 더합니다
            </li>
            <li>
              <span className="text-ink">4.</span> 혼잡 등급은 낮 시간 주차 대수의 상위 50·25·10% 기준으로 나눕니다
            </li>
          </ol>
          <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4">
            <div>
              <dt className="text-[12px] text-ink-3">입차 기록</dt>
              <dd className="num mt-1 text-[18px] font-medium">{formatNum(s.rows)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-3">분석 일수</dt>
              <dd className="num mt-1 text-[18px] font-medium">{s.days}일</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-3">기간</dt>
              <dd className="num mt-1 text-[14px] font-medium">
                {s.from.slice(2).replace(/-/g, '.')}–{s.to.slice(5).replace(/-/g, '.')}
              </dd>
            </div>
          </dl>
          {!s.complete ? (
            <p className="mt-4 rounded-lg bg-sunk px-3 py-2 text-[13px] text-ink-2">
              데이터 수집이 아직 끝나지 않아 일부 기간만 반영했어요. 월별 보정은 수집이 끝난 뒤 켭니다
            </p>
          ) : (
            s.sampledMonths.length > 0 && (
              <p className="mt-4 rounded-lg bg-sunk px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                원본에서 {s.sampledMonths.map((m) => `${m}월`).join('·')}은 한 달에 65,534건까지만 담겨 있어 주차 대수 계산에서
                뺐고, 출입문 비율에만 썼어요. 매달 말일과 11월 8–30일 기록은 원본에 없어요
              </p>
            )
          )}
        </Card>
      </div>
    </section>
  )
}
