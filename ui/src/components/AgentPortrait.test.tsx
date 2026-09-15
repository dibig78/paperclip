// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentPortrait } from "./AgentPortrait";
const companyId = "7918aebd-d2b9-4f6e-8fd7-09f19b5bd8e2";
const ids = ["cc1d27b9-dc40-4bba-9d7c-38423ad8f70a", "65dfd2ae-cc73-43e1-a6e5-b72aea7c6dcd", "05d1c14f-aa24-45d2-b172-36ee2652517a", "2e6753fd-0f28-4f68-8a2f-41d594506651", "e08957bc-8377-4380-893c-6e3691b59196", "7d530869-8327-4117-a6d4-89ebdd96d126", "62079aa1-a706-4f4b-b9b3-c8e35d9ea055", "8476ba52-c271-456c-a5fb-a9fa229462b1", "c4115a2c-a0e7-4fd7-acb2-9161979bc554"];
const names = ["luke", "leo", "rian", "yuna", "shadow", "noah", "teo", "kai", "elina"];
describe("AgentPortrait", () => {
 it("restores fallback after image error and recovers on identity change", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container=document.createElement("div"); const root=createRoot(container);
  act(()=>root.render(<AgentPortrait agent={{id:ids[0],companyId,name:"luke"}} fallback={<span>original</span>} />));
  act(()=>container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.innerHTML).toBe("<span>original</span>");
  act(()=>root.render(<AgentPortrait agent={{id:ids[1],companyId,name:"leo"}} fallback={<span>original</span>} />));
  expect(container.querySelector("img")?.src).toContain("leo.png");
  act(()=>root.unmount());
 });
 it.each(ids.map((id,i)=>[id,names[i]]))("maps stable ID %s",(id,name)=>{
  const html=renderToStaticMarkup(<AgentPortrait agent={{id,companyId,name:"renamed"}} fallback={<span>fallback</span>} />);
  expect(html).toContain(`/agent-portraits/dib39/${name}.png`);
  expect(html).toContain(`data-agent-id="${id}"`);
  expect(html).toContain('alt="renamed"');
 });
 it.each(["46c165e2-bd8b-4978-a2be-72c1fdc6da5f", "unknown", "luke"])("preserves unknown and Dongwoo fallback %s", id=>{
  expect(renderToStaticMarkup(<AgentPortrait agent={{id,companyId,name:"luke"}} fallback={<span>original</span>} />)).toBe("<span>original</span>");
 });
 it("does not match another company",()=>{
  expect(renderToStaticMarkup(<AgentPortrait agent={{id:ids[0],companyId:"other",name:"luke"}} fallback={<span>original</span>} />)).toBe("<span>original</span>");
 });
});
