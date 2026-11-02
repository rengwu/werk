import type { IncomingJob } from '../../src/backend/sources/types.ts';
import { fixtureJob } from './profile.ts';

// Fictional content in the RSS/Atom shapes observed from public feeds on 2026-11-02.
const prose = fixtureJob('feed').description;
const url = 'https://example.com/jobs/feed';
const item = (title: string, description: string, extra = '') => `<item><title>${title}</title><link>${url}?a=1&amp;b=2</link><guid>feed-1</guid><pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate><description><![CDATA[${description}]]></description>${extra}</item>`;
const rss = (content: string) => `<rss version="2.0" xmlns:job="https://example.com/job" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>${content}</channel></rss>`;
const at = 'Frontend engineer at Example Studio';
type FeedFixture = {name: string; xml: string; expected: Partial<IncomingJob>};
export const sourceFeedFixtures: FeedFixture[] = [
  {name:'NoDesk · Engineering', xml:rss(item(at,prose)), expected:{title:'Frontend engineer',company:'Example Studio',location:'',descriptionQuality:'excerpt'}},
  {name:'Real Work From Anywhere', xml:rss(item(at,prose,'<author>Example Studio</author>')), expected:{company:'Example Studio',location:'',descriptionQuality:'full'}},
  {name:'Dev Remotely', xml:rss(item(at,`Example Studio · Remote, Malaysia · USD 60K–90K\n\n${prose}`)), expected:{company:'Example Studio',location:'Remote, Malaysia',salary:'USD 60K–90K',descriptionQuality:'excerpt'}},
  {name:'Startup Jobs · Remote', xml:rss(item(at,`${prose}\n\nRemote, Canada · CAD 100K–120K`)), expected:{title:'Frontend engineer',company:'Example Studio',location:'Remote, Canada',salary:'CAD 100K–120K',descriptionQuality:'excerpt'}},
  {name:'Python Job Board', xml:rss(item('Frontend engineer, Python, Example Studio','London, UK\n'+prose)), expected:{title:'Frontend engineer, Python, Example Studio',company:'Not listed',location:'London, UK',descriptionQuality:'full'}},
  {name:'Rails Job Board', xml:rss(item(at,prose)), expected:{title:'Frontend engineer',company:'Example Studio',location:'',descriptionQuality:'full'}},
  {name:'Elixir Jobs', xml:rss(item('Frontend engineer',`Job place: Onsite<br/>Job type: Full time<br/>Job location: Helsinki, Finland<br/>${prose}`)), expected:{company:'Not listed',location:'Helsinki, Finland',arrangement:'On-site',employmentType:'Full time',descriptionQuality:'excerpt'}},
  {name:'FOSS Jobs', xml:rss(item('[Part-time] '+at,`<strong>Location:</strong> Remote, Germany<br/><strong>URL:</strong> ${url}<br/><strong>Description:</strong><br/>${prose}`)), expected:{title:'Frontend engineer',company:'Example Studio',location:'Remote, Germany',employmentType:'Part-time',descriptionQuality:'full'}},
  {name:'Berlin Startup Jobs · Engineering', xml:rss(item('Frontend engineer // Example Studio',prose+' Read more »','<dc:creator>posting-account</dc:creator>')), expected:{title:'Frontend engineer',company:'Example Studio',location:'',descriptionQuality:'excerpt'}},
  {name:'Hasjob', xml:`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Frontend engineer</title><id>feed-1</id><link href="${url}?a=1&amp;b=2"/><location>Anywhere</location><published>2026-11-01T12:00:00Z</published><content type="html"><![CDATA[<p><strong><a href="https://example.com">Example Studio</a></strong><br/>Anywhere</p>${prose}]]></content></entry></feed>`, expected:{company:'Example Studio',location:'Anywhere',arrangement:'Remote',descriptionQuality:'full'}},
  {name:'Remote First Jobs', xml:rss(item(at,`Location: London, UK<br/>This role is hybrid.<br/>${prose}`)), expected:{company:'Example Studio',location:'London, UK',arrangement:'Hybrid',descriptionQuality:'full'}},
  {name:'MoAIJobs', xml:rss(item(at,`<![CDATA[<h2>Frontend engineer</h2><p>Company: Example Studio</p><p>Location: Remote, Malaysia</p>${prose}]]>`,'<job:company>Example Studio</job:company><job:location>Remote, Malaysia</job:location>')), expected:{title:'Frontend engineer',company:'Example Studio',location:'Remote, Malaysia',descriptionQuality:'full'}},
  {name:'We Work Remotely · DevOps', xml:rss(item('Example Studio: Frontend engineer',prose,'<region>Malaysia</region>')), expected:{title:'Frontend engineer',company:'Example Studio',location:'Malaysia',arrangement:'Remote',locationScope:'hiring',descriptionQuality:'full'}},
];
