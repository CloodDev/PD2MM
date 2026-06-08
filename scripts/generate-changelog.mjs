#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--output');
const outFile = outIndex !== -1 && args[outIndex + 1] ? args[outIndex + 1] : 'changelog.md';

function run(cmd){
  try{ return execSync(cmd, {encoding: 'utf8'}).toString().trim(); }
  catch(e){ return '' }
}

function parseRepo(url){
  if(!url) return null;
  url = url.replace(/\.git$/, '');
  let m = url.match(/git@[^:]+:([^/]+)\/([^/]+)$/);
  if(m) return {owner: m[1], repo: m[2]};
  m = url.match(/github.com[:/](.+?)\/(.+?)$/);
  if(m) return {owner: m[1], repo: m[2]};
  return null;
}

const remote = run('git config --get remote.origin.url');
const repo = parseRepo(remote);

const tagsRaw = run('git tag --sort=creatordate');
const tags = tagsRaw ? tagsRaw.split('\n').filter(Boolean) : [];
const initialCommit = run('git rev-list --max-parents=0 HEAD').split('\n')[0] || '';

function parseCommits(raw){
  if(!raw) return [];
  return raw.split('\n').map(l => {
    const [hash, author, date, subject] = l.split('\x1f');
    return {hash, author, date, subject};
  });
}

function extractPR(subject){
  const m = subject.match(/(?:Merge pull request #|#)(\d+)|\(#(\d+)\)/);
  return m ? (m[1] || m[2]) : null;
}

async function fetchPR(prNumber){
  if(!repo) return null;
  const token = process.env.GITHUB_TOKEN;
  const headers = token ? {Authorization: `token ${token}`} : {};
  try{
    const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}`, {headers});
    if(!res.ok) return null;
    const data = await res.json();
    return {title: data.title, user: data.user && data.user.login};
  }catch(e){ return null; }
}

(async ()=>{
  const sections = [];

  // Build ranges for tags (ascending), then add Unreleased at end
  const ranges = [];
  for(let i=0;i<tags.length;i++){
    const start = i===0 ? initialCommit : tags[i-1];
    const end = tags[i];
    ranges.push({name: tags[i], start, end});
  }
  if(tags.length){
    ranges.push({name: 'Unreleased', start: tags[tags.length-1], end: 'HEAD'});
  } else {
    ranges.push({name: 'Unreleased', start: initialCommit, end: 'HEAD'});
  }

  for(const r of ranges){
    const raw = run(`git log ${r.start}..${r.end} --pretty=format:%H%x1f%an%x1f%ad%x1f%s --date=short`);
    const commits = parseCommits(raw);
    if(!commits.length) continue;

    const prMap = new Map();
    const others = [];
    for(const c of commits){
      const pr = extractPR(c.subject);
      if(pr){
        if(!prMap.has(pr)) prMap.set(pr, {number: pr, commits: [], title: null, user: null});
        prMap.get(pr).commits.push(c);
      } else {
        others.push(c);
      }
    }

    for(const [pr, val] of prMap){
      const info = await fetchPR(pr);
      if(info){ val.title = info.title; val.user = info.user; }
      else { val.title = val.commits[0].subject.replace(/Merge pull request #\d+\s+from\s+\S+\s*/,''); }
    }

    // determine date for section
    let date = '';
    if(r.name === 'Unreleased') date = new Date().toISOString().slice(0,10);
    else {
      const d = run(`git log -1 --format=%ad --date=short ${r.end}`);
      date = d || '';
    }

    const label = r.name === 'Unreleased' ? 'Unreleased' : r.name.replace(/^v/,'');
    const header = date ? `## ${label} - ${date}` : `## ${label}`;

    const lines = [];
    for(const [pr, v] of prMap){
      const title = v.title || v.commits[0].subject;
      const user = v.user || v.commits[0].author;
      lines.push(`- ${title} (#${pr}) — @${user}`);
    }
    for(const c of others){
      lines.push(`- ${c.subject} — ${c.author}`);
    }

    sections.push({header, body: lines.join('\n')});
  }

  if(!sections.length){ console.error('No commits found to build changelog'); process.exit(0); }

  // Build output preserving existing preamble if present
  let existing = '';
  try{ existing = fs.readFileSync(outFile, 'utf8'); }catch(e){ existing = '' }
  let preamble = '# Changelog\n\nThis changelog is reconstructed from the repository\'s tagged release history.\n\n';
  if(existing){
    const idx = existing.indexOf('\n## ');
    if(idx !== -1) preamble = existing.slice(0, idx+1);
    else if(existing.startsWith('# Changelog')){
      const firstDouble = existing.indexOf('\n\n');
      if(firstDouble !== -1) preamble = existing.slice(0, firstDouble+2);
    }
  }

  const outParts = [preamble.trim() + '\n\n'];
  // Sections are in ascending order (older -> newer); we want newest first
  for(const s of sections.reverse()){
    outParts.push(`${s.header}\n${s.body}\n\n`);
  }

  const final = outParts.join('');
  fs.writeFileSync(outFile, final, 'utf8');
  console.log(`Wrote reconstructed changelog to ${outFile}`);
})();
