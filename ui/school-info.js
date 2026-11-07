export function establishmentInfo(post,schools,registry) {
  const school=schools.find(s=>s.id===post.schoolId);
  let names=post.schoolNames || (school ? [school.name] : registry.some(s=>s.name===post.schoolName) ? [post.schoolName] : []);
  if(!names.length) {
    // 교육지원청 게시물은 제목에 명시된 학교만 연결하고, 부분 문자열이나 동명 학교를 추측하지 않는다.
    names=registry.filter(s=>[s.name,s.name.replace(/초등학교$/,'초').replace(/중학교$/,'중').replace(/고등학교$/,'고')].some(alias=>{
      const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      return new RegExp(`(^|[^가-힣A-Za-z0-9])${escaped}($|[^가-힣A-Za-z0-9])`).test(post.title || '');
    })).map(s=>s.name);
  }
  const info=names.map(name=>registry.find(s=>s.name===name));
  const types=[...new Set(info.map(s=>s?.establishment).filter(t=>['국립','공립','사립'].includes(t)))].sort();
  const complete=info.length && info.every(s=>['국립','공립','사립'].includes(s?.establishment));
  return {establishment:complete ? types.length===1 ? types[0] : types.join('·')+' 혼합' : '설립 구분 미확인',
    establishmentSources:info.filter(s=>s?.establishment),schoolLevel:info.length===1 ? info[0]?.level : null};
}
