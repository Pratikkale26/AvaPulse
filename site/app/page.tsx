import HeroConsole from "@/components/HeroConsole"

const GITHUB = "https://github.com/Pratikkale26/AvaPulse"

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 13h4.5l2.2-5.5L11 18l3-11 2.3 6H23"
        stroke="#e84142"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Page() {
  return (
    <>
      <nav className="nav">
        <div className="wrap nav-inner">
          <a className="wordmark" href="#">
            <Logo />
            AvaPulse
          </a>
          <div className="nav-links">
            <a href="#problem">The gap</a>
            <a href="#alerts">Alert rules</a>
            <a href="#how">How it works</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <a className="btn btn-ghost" href={GITHUB} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Open-source Avalanche observability</p>
            <h1>
              “Up” is not the same as <span className="accent">working.</span>
            </h1>
            <p className="hero-sub">
              A relayer can report healthy while cross-chain messages silently pile up. AvaPulse is
              the alerting layer for self-hosted Avalanche L1s and ICM relayers —{" "}
              <strong>it watches the message lifecycle, not just the process</strong>, and pings you
              on Telegram or Discord before your users notice.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-primary" href={GITHUB} target="_blank" rel="noreferrer">
                Star on GitHub
              </a>
              <a className="btn btn-ghost" href="#how">
                How it works
              </a>
            </div>
            <p className="hero-note">docker-compose up → dashboards + alerts in minutes</p>
          </div>
          <HeroConsole />
        </div>
      </header>

      <section className="section" id="problem">
        <div className="wrap">
          <p className="section-eyebrow">The gap</p>
          <h2>The failures that hurt are the ones nothing watches for</h2>
          <p className="section-intro">
            The ICM relayer ships raw Prometheus metrics and nothing else — no alerting layer, no
            official dashboards. Generic monitoring sees healthy processes. But the failures that
            take down cross-chain apps are <strong>semantic</strong>: every individual signal looks
            fine, and the outage only exists in the relationship between them.
          </p>
          <div className="fail-grid">
            <div className="fail-card">
              <div className="status-line">
                <span className="dot dot-ok" />
                <span className="status-ok">process: UP</span>
                <span style={{ color: "var(--faint)" }}>·</span>
                <span className="status-bad">delivered: 0</span>
              </div>
              <h3>The relayer that lied</h3>
              <p>
                Metrics endpoint responding, no error logs — while messages accumulate on the source
                chain and none arrive. Every health check passes. Every user transaction fails.
              </p>
            </div>
            <div className="fail-card">
              <div className="status-line">
                <span className="dot dot-ok" />
                <span className="status-ok">relayer: healthy</span>
                <span style={{ color: "var(--faint)" }}>·</span>
                <span className="status-bad">wallet: 0.02 AVAX</span>
              </div>
              <h3>The wallet that drained</h3>
              <p>
                The relayer pays destination-chain gas from its own wallet. When it empties,
                delivery halts with no error surfaced anywhere. The classic silent killer of ICM
                setups.
              </p>
            </div>
            <div className="fail-card">
              <div className="status-line">
                <span className="dot dot-ok" />
                <span className="status-ok">node: online</span>
                <span style={{ color: "var(--faint)" }}>·</span>
                <span className="status-bad">uptime: 81% ↓</span>
              </div>
              <h3>The validator that drifted</h3>
              <p>
                Uptime decays gradually, then crosses the threshold all at once. By the time an
                explorer shows it, rewards are already gone. You needed the alert last week.
              </p>
            </div>
          </div>
          <p className="punchline">
            No generic Alertmanager rule ships for any of these — detecting them requires
            understanding the Teleporter message lifecycle. That understanding is AvaPulse.
          </p>
        </div>
      </section>

      <section className="section" id="alerts">
        <div className="wrap">
          <p className="section-eyebrow">Shipped defaults</p>
          <h2>Five alert rules, zero assembly</h2>
          <p className="section-intro">
            Avalanche-native rules out of the box, routed to <strong>Telegram, Discord, Slack,
            email, and webhooks</strong> by severity — with recovery notifications, cooldowns, and
            escalation built in.
          </p>
          <div className="rules">
            <div className="rule">
              <div className="rule-stripe" />
              <div className="rule-body">
                <div className="rule-name">relayer_stalled_while_up</div>
                <p className="rule-desc">
                  Source chain emitting messages, relayer delivering none — while its process still
                  reports healthy.
                </p>
              </div>
              <span className="rule-tag semantic">semantic</span>
            </div>
            <div className="rule">
              <div className="rule-stripe" />
              <div className="rule-body">
                <div className="rule-name">relayer_gas_wallet_low</div>
                <p className="rule-desc">
                  Destination-chain balance below threshold, with projected time-to-empty from
                  recent spend rate.
                </p>
              </div>
              <span className="rule-tag semantic">semantic</span>
            </div>
            <div className="rule">
              <div className="rule-stripe warn" />
              <div className="rule-body">
                <div className="rule-name">icm_message_stuck</div>
                <p className="rule-desc">
                  A tracked message passed send but never reached execution within its delivery
                  window — alert carries the messageID and chain pair.
                </p>
              </div>
              <span className="rule-tag semantic">semantic</span>
            </div>
            <div className="rule">
              <div className="rule-stripe warn" />
              <div className="rule-body">
                <div className="rule-name">validator_uptime_dipping</div>
                <p className="rule-desc">
                  Fires while uptime is trending toward the floor — before rewards are lost, not
                  after.
                </p>
              </div>
              <span className="rule-tag">infra</span>
            </div>
            <div className="rule">
              <div className="rule-stripe" />
              <div className="rule-body">
                <div className="rule-name">chain_degraded</div>
                <p className="rule-desc">
                  RPC unresponsive or block height not advancing on any monitored L1.
                </p>
              </div>
              <span className="rule-tag">infra</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <p className="section-eyebrow">How it works</p>
          <h2>Point it at your endpoints. That’s the setup.</h2>
          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <h3>Declare your infra</h3>
              <p>
                One YAML file: your L1 RPCs, node metrics endpoints, relayers, and the gas wallets
                they spend from.
              </p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h3>AvaPulse correlates</h3>
              <p>
                The lifecycle tracker follows every Teleporter message by messageID — send, receive,
                execute, receipt — and knows what “late” means for each chain pair.
              </p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h3>You find out first</h3>
              <p>
                Alerts hit Telegram, Discord, Slack, or any webhook — with recoveries, so silence
                means healthy, not unknown.
              </p>
            </div>
          </div>
          <div className="codeblock">
            <div className="codeblock-bar">avapulse.yaml</div>
            <pre>
              <code>
                <span className="k">chains</span>:{"\n"}
                {"  "}- <span className="k">name</span>: <span className="s">my-l1</span>
                {"\n"}
                {"    "}
                <span className="k">rpc</span>:{" "}
                <span className="s">https://my-l1.example.com/rpc</span>
                {"\n"}
                {"    "}
                <span className="k">node_metrics</span>:{" "}
                <span className="s">http://10.0.0.5:9650/ext/metrics</span>
                {"\n"}
                <span className="k">relayers</span>:{"\n"}
                {"  "}- <span className="k">metrics</span>:{" "}
                <span className="s">http://10.0.0.6:9090/metrics</span>
                {"\n"}
                {"    "}
                <span className="k">gas_wallets</span>: [
                <span className="s">{"{ chain: my-l1, min_balance: 0.5 AVAX }"}</span>]{"\n"}
                <span className="k">icm</span>:{"\n"}
                {"  "}
                <span className="k">pairs</span>: [
                <span className="s">{"{ from: c-chain, to: my-l1, max_delivery_seconds: 120 }"}</span>
                ]{"\n"}
                <span className="k">notify</span>:{"\n"}
                {"  "}
                <span className="k">telegram</span>:{" "}
                <span className="s">{"{ bot_token: $TG_TOKEN, chat_id: $TG_CHAT }"}</span>
                {"\n\n"}
                <span className="c"># then:</span>
                {"\n"}$ docker-compose up
              </code>
            </pre>
          </div>
        </div>
      </section>

      <section className="section" id="compare">
        <div className="wrap">
          <p className="section-eyebrow">The landscape</p>
          <h2>Where AvaPulse sits</h2>
          <p className="section-intro">
            Good tools exist around the edges of this problem. None of them watch the cross-chain
            message layer.
          </p>
          <div className="compare-scroll">
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">ICM-aware</th>
                  <th scope="col">Alerting-first</th>
                  <th scope="col">Self-host</th>
                  <th scope="col">Free core</th>
                </tr>
              </thead>
              <tbody>
                <tr className="self">
                  <th scope="row">AvaPulse</th>
                  <td className="yes">✓</td>
                  <td className="yes">✓</td>
                  <td className="yes">✓</td>
                  <td className="yes">✓</td>
                </tr>
                <tr>
                  <th scope="row">Zeeve</th>
                  <td className="no">—</td>
                  <td className="yes">✓</td>
                  <td className="yes">✓</td>
                  <td className="no">enterprise pricing</td>
                </tr>
                <tr>
                  <th scope="row">Avalanche Notify</th>
                  <td className="no">—</td>
                  <td className="no">email only, beta</td>
                  <td className="no">—</td>
                  <td className="yes">✓</td>
                </tr>
                <tr>
                  <th scope="row">avalanche-monitoring</th>
                  <td className="no">—</td>
                  <td className="no">DIY Grafana</td>
                  <td className="yes">✓</td>
                  <td className="yes">✓</td>
                </tr>
                <tr>
                  <th scope="row">AvaCloud</th>
                  <td className="no">—</td>
                  <td className="no">—</td>
                  <td className="no">managed only</td>
                  <td className="no">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="compare-note">
            Zeeve monitors nodes and chains well — for enterprise budgets. Avalanche Notify covers
            primary-network validators by email, in beta. Neither tracks message lifecycles,
            relayer throughput, or gas wallets. That layer is the wedge.
          </p>
        </div>
      </section>

      <section className="section" id="roadmap">
        <div className="wrap">
          <p className="section-eyebrow">Building in public</p>
          <h2>Twelve weeks to MVP</h2>
          <div className="milestones">
            <div className="milestone">
              <div className="m-label">M1 · weeks 1–4</div>
              <h3>Collector &amp; dashboards</h3>
              <ul>
                <li>Node, relayer &amp; RPC ingestion</li>
                <li>Message-flow dashboard</li>
                <li>Live Fuji demo</li>
              </ul>
            </div>
            <div className="milestone">
              <div className="m-label">M2 · weeks 5–8</div>
              <h3>Semantic alert engine</h3>
              <ul>
                <li>ICM lifecycle tracker</li>
                <li>Five default rules + recoveries</li>
                <li>Telegram / Discord / Slack / webhooks</li>
              </ul>
            </div>
            <div className="milestone">
              <div className="m-label">M3 · weeks 9–12</div>
              <h3>Hosted beta</h3>
              <ul>
                <li>Multi-tenant hosted version</li>
                <li>3–5 real L1 teams onboarded</li>
                <li>Public usage dashboard</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footer-inner">
          <p>
            Built by <a href="https://github.com/Pratikkale26">Pratik Kale</a>, who also built{" "}
            <a href="https://icm-trace.vercel.app/">ICM Trace</a> — cross-chain debugging and live
            alerting are two halves of the same observability story. Open source under MIT.
          </p>
          <div className="footer-links">
            <a href={GITHUB} target="_blank" rel="noreferrer">
              github
            </a>
            <a href={`${GITHUB}/blob/main/docs/ARCHITECTURE.md`} target="_blank" rel="noreferrer">
              architecture
            </a>
            <a href={`${GITHUB}/blob/main/docs/ROADMAP.md`} target="_blank" rel="noreferrer">
              roadmap
            </a>
          </div>
        </div>
      </footer>
    </>
  )
}
