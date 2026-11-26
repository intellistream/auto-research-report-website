import { Link } from "react-router-dom";
import { useModSearchIndex } from "./search";
import "./related.css";
export default function RelatedGroupMods({topicId}:{topicId:string}) {
 const index=useModSearchIndex(true);
 if(!index.data&&!index.error)return null;
 const mods=index.data?.modSearchIndex.filter(m=>m.topicIds?.includes(topicId))||[];
 return <aside className="group-related" aria-label="相关组内 MOD"><strong>相关组内 MOD</strong>{index.error?<span>MOD 索引暂不可用。</span>:mods.length?<><span>{mods.length} 个已实现登记项 · 专题范围导航</span>{mods.slice(0,4).map(m=><Link key={m.componentId} to={"/group-mods/"+m.componentId+"?view=compare"}>{m.displayName}</Link>)}</>:<span>本轮尚未登记该专题的 MOD 关联。</span>}<Link to="/group-mods">查看全部组内 MOD</Link></aside>;
}
