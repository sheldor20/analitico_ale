from pathlib import Path
import re
root=Path('.')
def apply(file, old, new):
 p=root/file;s=p.read_text();assert old in s,(file,old[:120]);p.write_text(s.replace(old,new))
apply('components/dashboard.tsx','import "./dashboard-ux.css";', '''import "./dashboard-ux.css";
import PeriodSelector, { usePeriodSelection } from './period-selector';
import { periodTitle } from '@/lib/periods.mjs';''')
p=root/'components/dashboard.tsx';s=p.read_text()
s=re.sub(r'const periodNames: Record<string, string> = \{.*?\n\};\n','',s, count=1, flags=re.S)
s=s.replace('  const [period, setPeriod] = useState("ytd"),\n    [month, setMonth] = useState(new Date().getMonth()),\n    [level, setLevel]', '  const { period, month, setPeriod, setMonth } = usePeriodSelection();\n  const [level, setLevel]')
s=s.replace('  const paPanelKey =', '  const periodDescription = periodTitle(period, month, dataset?.year ?? config.year);\n  const paPanelKey =')
start=s.index('                <label>\n                  Período\n')
end=s.index('\n              </section>',start)
s=s[:start]+'''                <PeriodSelector period={period} month={month} year={dataset?.year ?? config.year}
                  onPeriodChange={setPeriod} onMonthChange={setMonth} />'''+s[end:]
s=s.replace('periodLabel: periodNames[period]', 'periodLabel: periodDescription')
s=s.replace('        periodNames[period],', '        periodDescription,')
s=s.replace('${periodNames[period]}', '${periodDescription}')
s=s.replace('sub={`${periodNames[period === "daily" ? "month" : period]} · ${MONTHS[month]}/${dataset?.year}`}', 'sub={periodDescription}')
s=s.replace('{periodNames[period]} · {MONTHS[month]}/{dataset?.year}', '{periodDescription}')
s=s.replace('`${dataset.year} · ${effectiveSource === "cadence" ? "Cadência comercial dos PAs" : metricName(effectiveMetric)} · ${periodDescription}`', '`${effectiveSource === "cadence" ? "Cadência comercial dos PAs" : metricName(effectiveMetric)} · ${periodDescription}`')
s=s.replace('`analitico-${effectiveSource}-${dataset?.year}-${month + 1}.csv`', '`analitico-${effectiveSource}-${dataset?.year}-${period}-${month + 1}.csv`')
s=s.replace('<strong>Diário:</strong> meta rateada e esforço','<strong>Esforço por dia útil:</strong> meta rateada e esforço')
a=s.index('                  {period === "daily" && (')
b=s.index('                  <section className="kpi-grid"',a)
s=s[:a]+s[b:]
s=s.replace('      period === "daily" ||\n', '')
s=s.replace('    period,\n    scopeLabel,','    period,\n    periodDescription,\n    scopeLabel,')
assert 'periodNames' not in s
p.write_text(s)
apply('components/portfolio-communication.tsx','import { MONTHS } from "@/lib/analytics.mjs";', "import PeriodSelector, { usePeriodSelection } from './period-selector';\nimport { periodTitle } from '@/lib/periods.mjs';")
apply('components/portfolio-communication.tsx','normalizeRecipients, PERIOD_LABELS, recipientsForContacts','normalizeRecipients, recipientsForContacts')
apply('components/portfolio-communication.tsx','  const [selectedPeriod, setSelectedPeriod] = useState(Object.hasOwn(PERIOD_LABELS, period) ? period : "ytd");\n  const [selectedMonth, setSelectedMonth] = useState(month);','  const { period: selectedPeriod, month: selectedMonth, setPeriod: setSelectedPeriod, setMonth: setSelectedMonth } = usePeriodSelection(period, month);')
p=root/'components/portfolio-communication.tsx';s=p.read_text();start=s.index('        <label>Período da mensagem');end=s.index('\n      </div>',start)
s=s[:start]+'''        <PeriodSelector label="Período da mensagem" period={selectedPeriod} month={selectedMonth} year={dataset.year}
          onPeriodChange={setSelectedPeriod} onMonthChange={setSelectedMonth} />'''+s[end:]
s=s.replace('period: PERIOD_LABELS[period] || period,','period: periodTitle(period, month, dataset.year),');p.write_text(s)
p=root/'lib/portfolio-presentation.mjs';s=p.read_text();s="import { periodTitle } from './periods.mjs';\n"+s
start=s.index('export function scenarioTitle(report) {');end=s.index('\nfunction cutoff(',start)
s=s[:start]+'''export function scenarioTitle(report) {
  return periodTitle(report.period, report.month, report.year);
}
'''+s[end:];p.write_text(s)
apply('lib/portfolio-communication.mjs','import { normalizeContactEmails }', "import { periodTitle } from './periods.mjs';\nimport { normalizeContactEmails }")
apply('lib/portfolio-communication.mjs','periodLabel: PERIOD_LABELS[period],','periodLabel: periodTitle(period, month, dataset.year),')
apply('components/scenario-panels.tsx',"import ComparisonDashboard from './comparison-dashboard';", "import ComparisonDashboard from './comparison-dashboard';\nimport { periodTitle } from '@/lib/periods.mjs';")
apply('components/scenario-panels.tsx','Cadência PA no período selecionado, sem somar à produção da cooperativa.', '{periodTitle(filters.period, filters.month, dataset.year)} · Cadência PA, sem somar à produção da cooperativa.')
apply('components/scenario-panels.tsx','Compare produção, metas e evolução nos mesmos meses fechados.', '{periodTitle(filters.period, filters.month, dataset.year)} · mesmos meses fechados nos dois anos.')
apply('components/scenario-panels.tsx','Não há mês fechado comum no período escolhido. A fonte mensal não permite reconstruir a produção de um dia de anos anteriores.', 'Não há mês fechado comum no período escolhido. Selecione outro período ou atualize as bases anuais.')
apply('tests/browser/portfolio.spec.mjs','  const dataset = portfolioFixture();','  await page.clock.setFixedTime(new Date("2026-09-10T15:00:00Z"));\n  const dataset = portfolioFixture();')
apply('tests/browser/portfolio.spec.mjs',"async function selectAugust(dialog) { await dialog.getByLabel('Mês de referência').selectOption('7'); }", "async function selectAugust(dialog) { await dialog.getByLabel('Período da mensagem').selectOption('month'); await dialog.getByLabel('Mês de referência').selectOption('7'); }")
apply('tests/browser/scenario-cases.mjs',"await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('ytd');\n    await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('7');", "await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('ytd');\n    await expect(page.getByLabel('Abrangência do período',{exact:true})).toContainText('JAN–SET/2026');")
p=root/'tests/browser/ux-cases.mjs';s=p.read_text();old="  await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('7');"
pos=s.index(old);s=s[:pos]+"  await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('month');\n"+s[pos:]
pos=s.index(old,s.index(old)+len(old));s=s[:pos]+"  await expect(page.getByLabel('Abrangência do período',{exact:true})).toContainText('JAN–SET/2026');"+s[pos+len(old):]
s=s.replace("  await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('daily');", "  await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('month');\n  await page.getByRole('combobox',{name:'Mês de referência',exact:true}).selectOption('8');")
p.write_text(s)
p=root/'tests/browser/portfolio.spec.mjs';s=p.read_text();s="import { registerPeriodTests } from './period-cases.mjs';\n"+s;s+='\nregisterPeriodTests({ test, expect, setup, composer });\n';p.write_text(s)
