import {dateTime,type Term} from './api';
import {clearSearches,removeSearch,type SavedSearch} from './freeStore';

export default function SearchHistory({items,terms,disabled,onSearch}:{items:SavedSearch[];terms:Term[];disabled:boolean;onSearch:(item:SavedSearch)=>void}){
  return <section className="recent-searches" aria-labelledby="recent-searches-title">
    <div className="section-heading"><div><h2 id="recent-searches-title">Recent searches · 搜索记录</h2><small>Last 20 unique course + term searches. Select one to check seats again.</small></div><button className="text-button" disabled={!items.length} onClick={clearSearches}>Clear search history</button></div>
    <p className="saved-data-note">Saved automatically in this browser, including course lookups from the AI assistant. Other browsers do not share this history. Clearing it keeps your watchlist.</p>
    {items.length?<ul className="recent-search-list">{items.map(item=>{
      const published=terms.find(term=>term.code===item.term);
      return <li key={`${item.term}:${item.code}`}><button className="recent-search-query" disabled={disabled} onClick={()=>onSearch(item)} aria-label={`Search again: ${item.code}, ${published?.description||item.termLabel}`}><strong>{item.code}</strong><span>{published?.description||item.termLabel}{!published&&terms.length>0?' · Not currently listed':''}</span><small>Last searched {dateTime(item.searchedAt)} · Check again ↗</small></button><button className="icon-button" aria-label={`Remove search ${item.code} ${item.term}`} onClick={()=>removeSearch(item.term,item.code)}>×</button></li>;
    })}</ul>:<p className="recent-empty">Your searches will appear here. Search a course to get started.</p>}
  </section>;
}
