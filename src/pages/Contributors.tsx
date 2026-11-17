import { ArrowLeft, ArrowUpRight, Github } from "lucide-react";
import { Link } from "react-router-dom";
import "./contributors.css";

// Public GitHub profiles and this repository's README / contribution history.
// Keep these local so the page does not depend on GitHub API availability.
const contributors = [
  {
    name: "Changwu Li", username: "Li-changwu", avatarId: 215941469,
    introduction: "社区研报网站负责人，参与交互与可视化优化、技术专题建设及日报发布维护。",
  },
  {
    name: "曹哲", username: "xmdhb", avatarId: 276146974,
    introduction: "参与日报展示、章首导语与前端功能的开发维护。",
  },
  {
    name: "ruicheng", username: "KimmoZAG", avatarId: 95903923,
    introduction: "参与网站初始搭建、Word 日报展示、推理流程图及 PR 搜索等功能开发。",
    bio: "Time waits for no one!",
  },
] as const;

export default function Contributors() {
  return <section className="contributors-page" aria-labelledby="contributors-title">
    <Link className="contributors-back" to="/"><ArrowLeft size={16} aria-hidden />返回首页</Link>
    <header className="contributors-heading">
      <h1 id="contributors-title">贡献者</h1>
      <p>认识参与社区研报网站建设与维护的伙伴。</p>
    </header>
    <ul className="contributors-grid">
      {contributors.map(person => <li key={person.username}>
        <article className="contributor-card" aria-labelledby={`contributor-${person.username}`}>
          <img className="contributor-avatar" src={`https://avatars.githubusercontent.com/u/${person.avatarId}?s=160&v=4`} alt="" width={56} height={56} decoding="async" />
          <header className="contributor-identity"><h2 id={`contributor-${person.username}`}>{person.name}</h2><span>@{person.username}</span></header>
          <div className="contributor-details">
            <p className="contributor-introduction">{person.introduction}</p>
            {"bio" in person && <p className="contributor-bio" lang="en">{person.bio}</p>}
          </div>
          <a className="contributor-homepage" href={`https://github.com/${person.username}`} target="_blank" rel="noopener noreferrer"
            aria-label={`访问 ${person.name} 的 GitHub 主页（新窗口）`}>
            <Github size={17} aria-hidden />GitHub 主页<ArrowUpRight size={16} aria-hidden />
          </a>
        </article>
      </li>)}
    </ul>
  </section>;
}
