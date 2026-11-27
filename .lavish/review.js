(() => {
  'use strict';
  const diagram = document.getElementById('diagram');
  const select = document.getElementById('flow-select');
  const currentButton = document.getElementById('show-current');
  const proposedButton = document.getElementById('show-proposed');
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const state = { flow: 'architecture', mode: 'current' };
  const sourceMap = {
    architecture: ['components/app-store.jsx:55', 'lib/dashboard/load.js:67', 'app/api/auth/list-users/route.js:3'],
    identity: ['lib/auth/current-user.js:22', 'components/sidebar.jsx:43', 'app/api/auth/list-users/route.js:3'],
    turnover: ['lib/tenant/status.js:31', 'lib/tenant/status.js:60', 'lib/tenant/core.js:30', 'CONTEXT.md:29'],
    leases: ['app/api/contracts/create/route.js:17', 'app/api/documents/process-lease/route.js:117', 'lib/contracts/mappers.js:9'],
    payments: ['property-management-app.jsx:4001', 'app/api/payments/create/route.js:8', 'CHANGELOG.md:3'],
    email: ['email-automation-components.jsx:245', 'app/api/email/batches/[id]/send/route.js:53', 'app/api/cron/email-automations/route.js:17'],
    renewals: ['app/api/renewals/create/route.js:13', 'app/api/renewals/send/route.js:10', 'docs/docuseal-tenant-renewal-spec.md']
  };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function svgElement(name, attributes = {}, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function wrap(text, maxChars) {
    const lines = [];
    for (const word of text.split(' ')) {
      const last = lines.length - 1;
      if (last >= 0 && lines[last].length + word.length + 1 <= maxChars) lines[last] += ' ' + word;
      else lines.push(word);
    }
    return lines;
  }
  function addLines(parent, lines, x, y, lineHeight, className) {
    const text = svgElement('text', {x, y, 'text-anchor':'middle', class:className});
    lines.forEach((line, index) => text.append(svgElement('tspan', {x, dy:index ? lineHeight : 0}, line)));
    parent.append(text);
  }
  function renderDiagram() {
    if (!diagram.getBoundingClientRect().width) return;
    const view = window.PM_FLOWS[state.flow][state.mode];
    diagram.replaceChildren();
    view.lanes.forEach(([label, stages, relationship], laneIndex) => {
      const lane = document.createElement('section');
      lane.className = 'lane';
      lane.id = 'lane-' + state.flow + '-' + state.mode + '-' + laneIndex;
      const title = document.createElement('h3');
      title.textContent = label;
      lane.append(title);
      diagram.append(lane);
      const width = Math.max(180, lane.clientWidth);
      const vertical = width < 620;
      const gap = vertical ? 28 : 34;
      const nodeWidth = vertical ? Math.min(width - 12, 420) : (width - 4 - gap * (stages.length - 1)) / stages.length;
      const prepared = stages.map(([name, sub, risk]) => {
        const names = wrap(name, Math.max(13, Math.floor((nodeWidth - 24) / 7.7)));
        const subs = wrap(sub, Math.max(16, Math.floor((nodeWidth - 24) / 6.1)));
        const height = 34 + names.length * 18 + subs.length * 14 + (risk ? 18 : 0);
        return {name, sub, risk, names, subs, height};
      });
      const maxHeight = Math.max(...prepared.map(n => n.height));
      const height = vertical ? prepared.reduce((sum, n) => sum + n.height, 4) + gap * (stages.length - 1) : maxHeight + 4;
      const accessibleFlow = label + '. ' + stages.map(([name, sub, risk], index) =>
        `${relationship === 'independent' ? 'Related record' : 'Step ' + (index + 1)}: ${name}. ${sub}.${risk ? ' Confirmed gap.' : ''}`
      ).join(' ');
      const svg = svgElement('svg', {viewBox:`0 0 ${width} ${height}`, role:'img', 'aria-label':accessibleFlow});
      svg.append(svgElement('title', {}, label + ': ' + stages.map(s => s[0]).join(relationship === 'independent' ? ' · ' : ' → ')));
      const markerId = lane.id + '-arrow';
      const defs = svgElement('defs');
      const marker = svgElement('marker', {id:markerId, viewBox:'0 0 10 10', refX:9, refY:5, markerWidth:6, markerHeight:6, orient:'auto-start-reverse'});
      marker.append(svgElement('path', {d:'M 0 1 L 9 5 L 0 9', fill:'none', stroke:'var(--muted)', 'stroke-width':1.5}));
      defs.append(marker); svg.append(defs);
      let yOffset = 2;
      prepared.forEach((node, index) => {
        const x = vertical ? (width - nodeWidth) / 2 : 2 + index * (nodeWidth + gap);
        const y = vertical ? yOffset : (maxHeight - node.height) / 2 + 2;
        const id = lane.id + '-node-' + index;
        const group = svgElement('g', {id});
        group.append(svgElement('title', {}, node.name + '. ' + node.sub + (node.risk ? '. Confirmed gap.' : '')));
        group.append(svgElement('rect', {x, y, width:nodeWidth, height:node.height, rx:10, class:node.risk ? 'risk-box' : 'node-box'}));
        addLines(group, node.names, x + nodeWidth / 2, y + 25, 18, 'node-label');
        addLines(group, node.subs, x + nodeWidth / 2, y + 25 + node.names.length * 18 + 4, 14, 'node-sub');
        if (node.risk) addLines(group, ['GAP'], x + nodeWidth / 2, y + node.height - 10, 14, 'node-risk-label');
        svg.append(group);
        if (index < prepared.length - 1 && relationship !== 'independent') {
          const edge = svgElement('g', {id:lane.id + '-edge-' + index});
          edge.append(svgElement('title', {}, node.name + ' to ' + prepared[index + 1].name));
          const d = vertical ? `M ${width/2} ${y+node.height+4} L ${width/2} ${y+node.height+gap-5}` : `M ${x+nodeWidth+5} ${maxHeight/2+2} L ${x+nodeWidth+gap-6} ${maxHeight/2+2}`;
          edge.append(svgElement('path', {d, class:'edge', 'marker-end':`url(#${markerId})`}));
          svg.append(edge);
        }
        yOffset += node.height + gap;
      });
      lane.append(svg);
    });
    document.getElementById('diagram-note').textContent = view.note;
    const evidence = document.getElementById('flow-evidence');
    evidence.replaceChildren();
    const label = document.createElement('span');label.textContent = 'Source evidence: ';evidence.append(label);
    sourceMap[state.flow].forEach((path, index) => {
      const code = document.createElement('code');code.textContent = path;evidence.append(code);
      if (index < sourceMap[state.flow].length - 1) evidence.append(document.createTextNode(' · '));
    });
  }
  select.addEventListener('change', () => {state.flow = select.value;renderDiagram();});
  function setMode(mode) {
    state.mode = mode;
    currentButton.setAttribute('aria-pressed', String(mode === 'current'));
    proposedButton.setAttribute('aria-pressed', String(mode === 'proposed'));
    renderDiagram();
  }
  currentButton.addEventListener('click', () => setMode('current'));
  proposedButton.addEventListener('click', () => setMode('proposed'));
  function activateTab(tab) {
    tabs.forEach(other => {
      const selected = tab === other;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
    });
    if (tab.id === 'tab-flows') renderDiagram();
  }
  tabs.forEach((tab, index) => {
    tab.tabIndex = index === 0 ? 0 : -1;
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus();
      activateTab(tabs[next]);
    });
  });
  function formatParagraph(text, sourceRefs) {
    const linked = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      if (url.startsWith('/Users/brianmar/workspace/propmanager/')) {
        const path = url.replace('/Users/brianmar/workspace/propmanager/', '');
        if (!sourceRefs.includes(path)) sourceRefs.push(path);
        return label;
      }
      return `[${label}](${url})`;
    });
    return escapeHtml(linked)
      .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  const list = document.getElementById('finding-list');
  window.PM_FINDINGS.forEach(finding => {
    const details = document.createElement('details');
    details.className = 'finding';details.id = finding.id;
    if (finding.id === 'R01') details.open = true;
    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="number">${finding.id}</span><span class="title">${escapeHtml(finding.title)}<span class="finding-brief">${escapeHtml(finding.summary)}</span></span><span class="tag ${finding.priority === 'Critical' ? 'risk' : ''}">${finding.priority}</span>`;
    const body = document.createElement('div');body.className='body';
    const explanation=document.createElement('dl');explanation.className='explanation';
    for(const [key,label] of [['now','Today'],['why','Why it matters'],['change','Proposed change']]) {
      const row=document.createElement('div');
      const term=document.createElement('dt');term.textContent=label;
      const description=document.createElement('dd');description.textContent=finding[key];
      row.append(term,description);explanation.append(row);
    }
    const example=document.createElement('p');example.className='example';example.textContent=finding.example;
    body.append(explanation,example);
    const technical=document.createElement('details');technical.className='technical';
    const technicalSummary=document.createElement('summary');technicalSummary.textContent='Code evidence and completion criteria';
    const technicalBody=document.createElement('div');technicalBody.className='technical-body';
    technical.append(technicalSummary,technicalBody);
    const refs=[];
    for(const paragraph of finding.body.split(/\n\n+/)) {
      const p=document.createElement('p');
      if(paragraph.startsWith('**Acceptance:')) p.className='accept';
      p.innerHTML=formatParagraph(paragraph,refs);technicalBody.append(p);
    }
    const sources=document.createElement('div');sources.className='sources';
    refs.forEach((path,index)=>{const source=document.createElement('span');source.className='source mono';source.textContent=path;source.id=finding.id+'-source-'+index;sources.append(source);});
    technicalBody.append(sources);body.append(technical);
    const button=document.createElement('button');button.className='queue';button.type='button';button.textContent='Queue discussion';
    const status=document.createElement('span');status.className='queue-status';status.setAttribute('aria-live','polite');
    button.addEventListener('click',async()=>{
      if(!window.lavish || typeof window.lavish.queuePrompt!=='function') {status.textContent='Open this report in Lavish to queue feedback.';return;}
      try {
        await window.lavish.queuePrompt(`Discuss ${finding.id}: ${finding.title}. Explain the concrete failure, evidence, proposed interface, tradeoff, and smallest next step. This is a discussion request, not authorization to modify application code.`, {tag:'architecture-review',text:`Discuss ${finding.id}: ${finding.title}`,element:details,queueKey:'discuss-'+finding.id,data:{findingId:finding.id,action:'discuss',sources:refs}});
        status.textContent='Queued. Use Lavish Send to Agent to submit.';
      }catch(error){status.textContent='Could not queue feedback: '+error.message;}
    });
    body.append(button,status);details.append(summary,body);list.append(details);
  });
  let observedWidth=0;
  new ResizeObserver(entries=>{
    const width=Math.round(entries[0].contentRect.width);
    if(width>0 && width!==observedWidth){observedWidth=width;renderDiagram();}
  }).observe(diagram);
  renderDiagram();
})();
