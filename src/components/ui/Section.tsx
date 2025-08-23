import React from "react";

export function Section({title,children,className=""}:{title?:string;children?:React.ReactNode;className?:string;}){
  return (<section className={`section ${className}`}>
    {title ? <div className="h-label mb-3">{title}</div> : null}
    {children}
  </section>);
}
